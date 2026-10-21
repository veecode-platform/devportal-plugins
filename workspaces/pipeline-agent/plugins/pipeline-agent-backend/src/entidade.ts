import type { BackstageCredentials } from '@backstage/backend-plugin-api';
import { parseEntityRef, stringifyEntityRef } from '@backstage/catalog-model';
import { InputError, NotFoundError } from '@backstage/errors';
import type { CatalogService } from '@backstage/plugin-catalog-node';
import {
  GITLAB_PROJECT_SLUG_ANNOTATION,
  PIPELINE_AGENT_ENABLED_ANNOTATION,
} from '@veecode-platform/backstage-plugin-pipeline-agent-common';

// The entity is the only way a caller names a project. The GitLab project comes
// from its annotation, and only entities that opted in are answered at all.

export type EntidadeResolvida = { entityRef: string; projectSlug: string };

const SLUG_VALIDO = /^[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)+$/;

export function normalizarEntityRef(valor: unknown): string {
  if (typeof valor !== 'string' || valor.trim() === '')
    throw new InputError('entityRef é obrigatório');
  try {
    return stringifyEntityRef(parseEntityRef(valor.trim()));
  } catch {
    throw new InputError('entityRef inválido: use a forma kind:namespace/name');
  }
}

// An entity without the opt-in annotation answers exactly like an unknown one, so
// a caller cannot tell the two apart.
export async function resolverEntidade(
  catalog: CatalogService,
  credentials: BackstageCredentials,
  entityRef: string,
): Promise<EntidadeResolvida> {
  const ref = normalizarEntityRef(entityRef);
  const entidade = await catalog.getEntityByRef(ref, { credentials });
  const anotacoes = entidade?.metadata.annotations ?? {};
  if (!entidade || anotacoes[PIPELINE_AGENT_ENABLED_ANNOTATION] !== 'enabled') {
    throw new NotFoundError(`Entidade ${ref} não encontrada`);
  }
  const slug = (anotacoes[GITLAB_PROJECT_SLUG_ANNOTATION] ?? '').trim();
  if (!slug)
    throw new InputError(
      `Entidade ${ref} não tem a anotação ${GITLAB_PROJECT_SLUG_ANNOTATION}`,
    );
  if (!SLUG_VALIDO.test(slug))
    throw new InputError(
      `A anotação ${GITLAB_PROJECT_SLUG_ANNOTATION} precisa ser grupo/projeto`,
    );
  return { entityRef: ref, projectSlug: slug };
}
