import { createBackendModule } from '@backstage/backend-plugin-api';
import { policyExtensionPoint } from '@backstage/plugin-permission-node/alpha';
import {
  AuthorizeResult,
  type PolicyDecision,
} from '@backstage/plugin-permission-common';
import type {
  PermissionPolicy,
  PolicyQuery,
  PolicyQueryUser,
} from '@backstage/plugin-permission-node';

// ---------------------------------------------------------------------------
// Role definitions
// ---------------------------------------------------------------------------

type Role = 'kong-admins' | 'kong-operators' | 'kong-viewers';

const USER_ROLES: Record<string, Role> = {
  'user:default/guest': 'kong-admins',
  'user:default/operator': 'kong-operators',
  'user:default/viewer': 'kong-viewers',
};

const READ_PERMISSIONS = new Set([
  'kong.service.read',
  'kong.plugins.read',
  'kong.routes.read',
]);

const PLUGIN_MUTATION_PERMISSIONS = new Set([
  'kong.plugin.service.apply',
  'kong.plugin.service.update',
  'kong.plugin.service.disable',
  'kong.plugin.route.apply',
  'kong.plugin.route.update',
  'kong.plugin.route.disable',
]);

// ---------------------------------------------------------------------------
// Policy implementation
// ---------------------------------------------------------------------------

class KongPermissionPolicy implements PermissionPolicy {
  async handle(
    request: PolicyQuery,
    user?: PolicyQueryUser,
  ): Promise<PolicyDecision> {
    const name = request.permission.name;

    // Non-Kong permissions: allow so the rest of Backstage works normally
    if (!name.startsWith('kong.')) {
      return { result: AuthorizeResult.ALLOW };
    }

    const userEntityRef = user?.info?.userEntityRef;
    const role = userEntityRef ? USER_ROLES[userEntityRef] : undefined;

    // Unknown users get denied for Kong permissions
    if (!role) {
      return { result: AuthorizeResult.DENY };
    }

    // All roles can read
    if (READ_PERMISSIONS.has(name)) {
      return { result: AuthorizeResult.ALLOW };
    }

    // Admins can do everything
    if (role === 'kong-admins') {
      return { result: AuthorizeResult.ALLOW };
    }

    // Operators can mutate plugins but not routes
    if (role === 'kong-operators' && PLUGIN_MUTATION_PERMISSIONS.has(name)) {
      return { result: AuthorizeResult.ALLOW };
    }

    // Viewers (and operators for route mutations): deny
    return { result: AuthorizeResult.DENY };
  }
}

// ---------------------------------------------------------------------------
// Backend module
// ---------------------------------------------------------------------------

export default createBackendModule({
  pluginId: 'permission',
  moduleId: 'kong-policy',
  register(reg) {
    reg.registerInit({
      deps: { policy: policyExtensionPoint },
      async init({ policy }) {
        policy.setPolicy(new KongPermissionPolicy());
      },
    });
  },
});
