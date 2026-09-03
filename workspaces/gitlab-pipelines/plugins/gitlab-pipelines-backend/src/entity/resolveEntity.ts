import { BackstageCredentials } from '@backstage/backend-plugin-api';
import { ANNOTATION_LOCATION, ANNOTATION_SOURCE_LOCATION, parseEntityRef, stringifyEntityRef } from '@backstage/catalog-model';
import { InputError, NotFoundError } from '@backstage/errors';
import { CatalogService } from '@backstage/plugin-catalog-node';
import { GITLAB_PROJECT_SLUG_ANNOTATION } from '@veecode-platform/gitlab-pipelines-common';

export interface ResolvedEntity { entityRef: string; host: string; projectSlug: string; ownerRef: string }

export async function resolveEntity(
  catalog: CatalogService,
  credentials: BackstageCredentials,
  params: { namespace: string; kind: string; name: string },
): Promise<ResolvedEntity> {
  const entityRef = stringifyEntityRef({ kind: params.kind, namespace: params.namespace, name: params.name });
  const entity = await catalog.getEntityByRef(entityRef, { credentials });
  if (!entity) throw new NotFoundError(`Entity ${entityRef} not found`);

  const annotations = entity.metadata.annotations ?? {};
  const projectSlug = annotations[GITLAB_PROJECT_SLUG_ANNOTATION];
  if (!projectSlug) throw new InputError(`Entity ${entityRef} has no ${GITLAB_PROJECT_SLUG_ANNOTATION} annotation`);

  const owner = (entity.spec as any)?.owner;
  if (typeof owner !== 'string' || !owner) throw new InputError(`Entity ${entityRef} has no spec.owner`);
  const ownerRef = stringifyEntityRef(parseEntityRef(owner, { defaultKind: 'group', defaultNamespace: 'default' }));

  const location = annotations[ANNOTATION_SOURCE_LOCATION] ?? annotations[ANNOTATION_LOCATION];
  let host = 'gitlab.com';
  if (location?.startsWith('url:')) {
    try { host = new URL(location.slice(4)).host; } catch { /* keep default */ }
  }
  return { entityRef, host, projectSlug, ownerRef };
}
