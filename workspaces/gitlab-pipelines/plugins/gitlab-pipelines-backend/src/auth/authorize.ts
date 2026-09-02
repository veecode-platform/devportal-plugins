import { HttpAuthService, PermissionsService, UserInfoService } from '@backstage/backend-plugin-api';
import { NotAllowedError } from '@backstage/errors';
import { CatalogService } from '@backstage/plugin-catalog-node';
import { AuthorizeResult, ResourcePermission } from '@backstage/plugin-permission-common';
import express from 'express';
import { ResolvedEntity, resolveEntity } from '../entity/resolveEntity';

export interface AuthorizedContext extends ResolvedEntity { userEntityRef: string }

export function createAuthorizer(deps: { httpAuth: HttpAuthService; userInfo: UserInfoService; permissions: PermissionsService; catalog: CatalogService }) {
  return async (req: express.Request, permission: ResourcePermission): Promise<AuthorizedContext> => {
    // (a) user credentials only
    const credentials = await deps.httpAuth.credentials(req, { allow: ['user'] });
    // (b) entity + annotation (throws 404/400 before any authorization)
    const resolved = await resolveEntity(deps.catalog, credentials, req.params as any);
    // (c) named permission, resource-scoped
    const [decision] = await deps.permissions.authorize([{ permission, resourceRef: resolved.entityRef }], { credentials });
    if (decision.result !== AuthorizeResult.ALLOW) {
      throw new NotAllowedError(`Not allowed: ${permission.name} on ${resolved.entityRef}`);
    }
    // (d) ownership is invariant
    const info = await deps.userInfo.getUserInfo(credentials);
    if (!info.ownershipEntityRefs.includes(resolved.ownerRef)) {
      throw new NotAllowedError(`Not allowed: ${info.userEntityRef} is not an owner of ${resolved.entityRef}`);
    }
    return { ...resolved, userEntityRef: info.userEntityRef };
  };
}
