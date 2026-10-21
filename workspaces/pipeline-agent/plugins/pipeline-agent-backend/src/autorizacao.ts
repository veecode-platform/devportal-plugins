import type {
  BackstageCredentials,
  HttpAuthService,
  PermissionsService,
} from '@backstage/backend-plugin-api';
import { NotAllowedError } from '@backstage/errors';
import type { CatalogService } from '@backstage/plugin-catalog-node';
import {
  AuthorizeResult,
  type ResourcePermission,
} from '@backstage/plugin-permission-common';
import type express from 'express';
import { type EntidadeResolvida, resolverEntidade } from './entidade';

// Two steps, so the SSE route can answer its headers between them. First the
// credentials of a user (local, no upstream call). Then the entity, the project
// allowlist and the named permission on the entity (catalog and RBAC calls).

export type Autorizador = {
  credenciais(req: express.Request): Promise<BackstageCredentials>;
  entidade(
    credenciais: BackstageCredentials,
    entityRef: string,
    permissao?: ResourcePermission,
  ): Promise<EntidadeResolvida>;
};

// Entry of pipelineAgent.allowedProjects: an exact slug, or a group prefix written
// as group/*.
export function projetoPermitido(slug: string, permitidos: string[]): boolean {
  return permitidos.some(item =>
    item.endsWith('/*') ? slug.startsWith(item.slice(0, -1)) : slug === item,
  );
}

export function criarAutorizador(deps: {
  httpAuth: HttpAuthService;
  permissions: PermissionsService;
  catalog: CatalogService;
  projetosPermitidos: string[];
}): Autorizador {
  return {
    credenciais: req => deps.httpAuth.credentials(req, { allow: ['user'] }),
    async entidade(credenciais, entityRef, permissao) {
      const entidade = await resolverEntidade(
        deps.catalog,
        credenciais,
        entityRef,
      );
      if (!projetoPermitido(entidade.projectSlug, deps.projetosPermitidos)) {
        throw new NotAllowedError(
          'Projeto não está na lista de projetos permitidos do agente de pipeline',
        );
      }
      if (permissao) {
        const [decisao] = await deps.permissions.authorize(
          [{ permission: permissao, resourceRef: entidade.entityRef }],
          {
            credentials: credenciais,
          },
        );
        if (decisao.result !== AuthorizeResult.ALLOW) {
          throw new NotAllowedError(`Não permitido: ${permissao.name}`);
        }
      }
      return entidade;
    },
  };
}
