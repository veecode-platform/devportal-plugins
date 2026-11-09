import { type Entity, stringifyEntityRef } from '@backstage/catalog-model';
import type { BackstageCredentials } from '@backstage/backend-plugin-api';
import { NotAllowedError } from '@backstage/errors';
import type { PublicationDependencies } from './dependencies';
import { DEFAULT_NAMESPACE } from './ownership';
import { PIECE_PATTERN } from './resultFiles';

export const PROJECT_SLUG_ANNOTATION = 'gitlab.com/project-slug';
export const MANAGED_BY_LOCATION_ANNOTATION =
  'backstage.io/managed-by-location';
export const TEMPLATE_VERSION_ANNOTATION = 'backstage.io/template-version';

const PROJECT_PATH_PATTERN = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)+$/;
/**
 * GitLab's separator before a repository route. The project path ends at its
 * first occurrence. A location without it is refused: the legacy form, with
 * `blob`, `tree` or `raw` after the project, cannot tell the project apart.
 */
const REPOSITORY_SEPARATOR = '/-/';

/** The app's GitLab project, as the portal reads it: where it is and which host holds it. */
export interface AppProject {
  origin: string;
  host: string;
  slug: string;
}

/**
 * Refuses with a next step. Every refusal here happens before the portal reads
 * GitLab, so a System that names a project it does not come from gets nothing.
 */
export function refuseProject(detail: string): NotAllowedError {
  return new NotAllowedError(
    `${detail} The portal will not read this app's GitLab project. Tell the platform team; do not change the code.`,
  );
}

/**
 * The project of a System. The location comes from the catalog's
 * managed-by-location annotation, which the catalog sets from where it read the
 * entity, not from a file the owner writes. The project-slug annotation must
 * name that same project, and the project must sit under the configured group.
 * Undefined when the catalog names no project at all.
 */
export function projectOf(
  system: Entity,
  projectPathPrefix: string,
): AppProject | undefined {
  const annotations = system.metadata.annotations ?? {};
  const slug = annotations[PROJECT_SLUG_ANNOTATION];
  if (!slug) {
    return undefined;
  }
  const origin = originOf(annotations[MANAGED_BY_LOCATION_ANNOTATION]);
  if (slug !== origin.slug) {
    throw refuseProject(
      'The project name in the catalog entry does not match the location the catalog recorded for it.',
    );
  }
  if (!origin.slug.startsWith(`${projectPathPrefix}/`)) {
    throw refuseProject(
      "The app's GitLab project is outside the group this portal reads.",
    );
  }
  return origin;
}

/**
 * Where the project path ends: at the first GitLab separator. A location
 * without one is refused (undefined).
 */
function projectEnd(pathname: string): number | undefined {
  const separator = pathname.indexOf(REPOSITORY_SEPARATOR);
  return separator > 0 ? separator : undefined;
}

/** The host and project path of a location the catalog recorded, as a URL. */
function originOf(location: string | undefined): AppProject {
  const unknown = refuseProject(
    'The catalog did not record a GitLab location for this app, so the portal cannot tell which project it is.',
  );
  if (!location?.startsWith('url:')) {
    throw unknown;
  }
  let url: URL;
  try {
    url = new URL(location.slice('url:'.length));
  } catch {
    throw unknown;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw unknown;
  }
  const pathname = url.pathname;
  const cut = projectEnd(pathname);
  if (cut === undefined) {
    throw unknown;
  }
  const slug = pathname.slice(1, cut);
  const segments = slug.split('/');
  if (
    !PROJECT_PATH_PATTERN.test(slug) ||
    segments.some(segment => segment === '.' || segment === '..')
  ) {
    throw unknown;
  }
  return { origin: url.origin, host: url.host, slug };
}

export interface AppPiece {
  entityRef: string;
  name: string;
  title?: string;
  templateVersion?: string;
  dashboardUrl?: string;
  component: Entity;
}

/**
 * The Components of the System, read with the caller's credentials. A piece's
 * name is its Component's name without the app's `<app>-` prefix.
 */
export async function appPieces(
  deps: Pick<PublicationDependencies, 'catalog' | 'settings'>,
  system: Entity,
  credentials: BackstageCredentials,
): Promise<AppPiece[]> {
  const systemRef = stringifyEntityRef({
    kind: 'system',
    namespace: system.metadata.namespace ?? DEFAULT_NAMESPACE,
    name: system.metadata.name,
  });
  const { items } = await deps.catalog.getEntities(
    { filter: { kind: 'component', 'relations.partOf': systemRef } },
    { credentials },
  );
  const prefix = `${system.metadata.name}-`;
  return items
    .map(component => {
      const annotations = component.metadata.annotations ?? {};
      const dashboard = annotations[deps.settings.dashboardAnnotation];
      const name = component.metadata.name.startsWith(prefix)
        ? component.metadata.name.slice(prefix.length)
        : component.metadata.name;
      return {
        entityRef: stringifyEntityRef({
          kind: 'component',
          namespace: component.metadata.namespace ?? DEFAULT_NAMESPACE,
          name: component.metadata.name,
        }),
        name,
        title: component.metadata.title,
        templateVersion: annotations[TEMPLATE_VERSION_ANNOTATION],
        dashboardUrl:
          dashboard && /^https?:\/\//.test(dashboard) ? dashboard : undefined,
        component,
      };
    })
    .filter(piece => PIECE_PATTERN.test(piece.name));
}
