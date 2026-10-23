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
import type { Vinculo } from './configuracao';
import { type EntidadeResolvida, resolverEntidade } from './entidade';

// Two steps, so the caller can check the credentials before any catalog call. First
// the credentials of a user (local). Then the entity, its binding to the project,
// and the named permission on the entity (catalog and RBAC calls).

export type Autorizador = {
  credenciais(req: express.Request): Promise<BackstageCredentials>;
  entidade(
    credenciais: BackstageCredentials,
    entityRef: string,
    permissao?: ResourcePermission,
  ): Promise<EntidadeResolvida>;
};

// The project comes from the entity's annotation, so a project is written by exactly
// the entity bound to it. Exact match on both fields, no patterns.
export function vinculoPermitido(
  entityRef: string,
  projectSlug: string,
  vinculos: Vinculo[],
): boolean {
  return vinculos.some(
    v => v.project === projectSlug && v.entityRef === entityRef,
  );
}

export function criarAutorizador(deps: {
  httpAuth: HttpAuthService;
  permissions: PermissionsService;
  catalog: CatalogService;
  vinculos: Vinculo[];
}): Autorizador {
  return {
    credenciais: req => deps.httpAuth.credentials(req, { allow: ['user'] }),
    async entidade(credenciais, entityRef, permissao) {
      const entidade = await resolverEntidade(
        deps.catalog,
        credenciais,
        entityRef,
      );
      if (
        !vinculoPermitido(
          entidade.entityRef,
          entidade.projectSlug,
          deps.vinculos,
        )
      ) {
        throw new NotAllowedError(
          'Esta entidade não está ligada a este projeto na lista de permissões do agente de pipeline',
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
