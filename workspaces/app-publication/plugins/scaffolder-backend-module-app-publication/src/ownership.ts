import {
  type CompoundEntityRef,
  type Entity,
  parseEntityRef,
  stringifyEntityRef,
} from '@backstage/catalog-model';
import type { BackstageCredentials } from '@backstage/backend-plugin-api';
import { InputError, NotAllowedError, NotFoundError } from '@backstage/errors';
import type { PublicationDependencies } from './dependencies';

export const DEFAULT_NAMESPACE = 'default';

export function parseSystemRef(app: string): CompoundEntityRef {
  const refusal = new InputError(
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
 * Requires the caller to be a user who owns the System, directly or through a
 * group, as the app-secrets module does. It runs before any GitLab request, so
 * a caller who is not the owner gets no GitLab data at all.
 */
export async function requireOwnedSystem(
  options: Pick<PublicationDependencies, 'auth' | 'catalog' | 'userInfo'> & {
    app: CompoundEntityRef;
    credentials: BackstageCredentials;
  },
): Promise<{ system: Entity }> {
  const { auth, catalog, userInfo, app, credentials } = options;
  if (!auth.isPrincipal(credentials, 'user')) {
    throw new NotAllowedError(
      "only a signed-in user can read an app's publication",
    );
  }

  const info = await userInfo.getUserInfo(credentials);
  const ref = stringifyEntityRef(app);
  const system = await catalog.getEntityByRef(ref, { credentials });
  if (!system) {
    throw new NotFoundError(
      `System "${ref}" was not found, or the user cannot read it`,
    );
  }

  const owner = system.spec?.owner;
  const ownedRefs = new Set(
    [info.userEntityRef, ...info.ownershipEntityRefs].map(normalizedRef),
  );
  if (typeof owner !== 'string' || !ownedRefs.has(normalizedRef(owner))) {
    throw new NotAllowedError(
      `The user does not own "${ref}". Only the app's owner can read its publication. Check the app's name with the catalog tools, or ask its owner.`,
    );
  }

  return { system };
}

/** `group:example-team` and `group:default/example-team` name the same owner. */
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
