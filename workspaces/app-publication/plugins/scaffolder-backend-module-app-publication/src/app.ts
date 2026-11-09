import { type Entity, stringifyEntityRef } from '@backstage/catalog-model';
import type { BackstageCredentials } from '@backstage/backend-plugin-api';
import type { PublicationDependencies } from './dependencies';
import { DEFAULT_NAMESPACE } from './ownership';
import { PIECE_PATTERN } from './resultFiles';

export const PROJECT_SLUG_ANNOTATION = 'gitlab.com/project-slug';
export const SOURCE_LOCATION_ANNOTATION = 'backstage.io/source-location';
export const TEMPLATE_VERSION_ANNOTATION = 'backstage.io/template-version';

export interface AppProject {
  host: string;
  slug: string;
}

/** The app's GitLab project, from the System's annotations; undefined when the catalog does not name one. */
export function projectOf(system: Entity): AppProject | undefined {
  const annotations = system.metadata.annotations ?? {};
  const slug = annotations[PROJECT_SLUG_ANNOTATION];
  const location = annotations[SOURCE_LOCATION_ANNOTATION];
  if (!slug || !location?.startsWith('url:')) {
    return undefined;
  }
  try {
    return { host: new URL(location.slice('url:'.length)).host, slug };
  } catch {
    return undefined;
  }
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
