import {
  type CompoundEntityRef,
  type Entity,
  parseEntityRef,
  stringifyEntityRef,
} from '@backstage/catalog-model';
import type {
  AuthService,
  BackstageCredentials,
  UserInfoService,
} from '@backstage/backend-plugin-api';
import type { CatalogService } from '@backstage/plugin-catalog-node';
import { DEFAULT_NAMESPACE } from './names';

export interface OwnershipServices {
  auth: AuthService;
  catalog: CatalogService;
  userInfo: UserInfoService;
}

export interface OwnedSystem {
  system: Entity;
  user: { entityRef: string; name: string };
}

export function parseSystemRef(app: string): CompoundEntityRef {
  const refusal = new Error(
    `app must be a System entity reference, for example system:${DEFAULT_NAMESPACE}/example-app`,
  );
  let ref: CompoundEntityRef;
  try {
    ref = parseEntityRef(app);
  } catch {
    throw refusal;
  }
  if (ref.kind !== 'system') {
    throw refusal;
  }
  return ref;
}

/**
 * Requires the caller to be a user who owns the System. The owner and the
 * user's own refs are compared in their full form, so `group:example-team` and
 * `group:default/example-team` are the same owner.
 */
export async function requireOwnedSystem(
  options: OwnershipServices & {
    app: CompoundEntityRef;
    credentials: BackstageCredentials;
  },
): Promise<OwnedSystem> {
  const { auth, catalog, userInfo, app, credentials } = options;
  if (!auth.isPrincipal(credentials, 'user')) {
    throw new Error('only a signed-in user can work with app secrets');
  }

  const info = await userInfo.getUserInfo(credentials);
  const ref = stringifyEntityRef(app);
  const system = await catalog.getEntityByRef(ref, { credentials });
  if (!system) {
    throw new Error(
      `System "${ref}" was not found, or the user cannot read it`,
    );
  }

  const owner = system.spec?.owner;
  if (typeof owner !== 'string') {
    throw new Error(`System "${ref}" has no owner`);
  }
  const ownerRef = normalizedRef(owner);
  const ownedRefs = new Set(
    [info.userEntityRef, ...info.ownershipEntityRefs].map(normalizedRef),
  );
  if (!ownedRefs.has(ownerRef)) {
    throw new Error(`the user does not own System "${ref}"`);
  }

  return {
    system,
    user: {
      entityRef: info.userEntityRef,
      name: parseEntityRef(info.userEntityRef).name,
    },
  };
}

function normalizedRef(ref: string): string {
  try {
    return stringifyEntityRef(
      parseEntityRef(ref, {
        defaultKind: 'group',
        defaultNamespace: DEFAULT_NAMESPACE,
      }),
    );
  } catch {
    return ref;
  }
}
