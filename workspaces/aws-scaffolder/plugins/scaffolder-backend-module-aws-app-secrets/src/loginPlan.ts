import type { SecretPresence } from './secretsManager';

export const LOGIN_SECRET_NAMES = [
  'OAUTH2_PROXY_CLIENT_ID',
  'OAUTH2_PROXY_CLIENT_SECRET',
  'OAUTH2_PROXY_COOKIE_SECRET',
] as const;
export type LoginSecretName = (typeof LOGIN_SECRET_NAMES)[number];

export const CLIENT_ID_TAG = 'veecode.io/cognito-client-id';

export type LoginPlan =
  | { kind: 'create' }
  | { kind: 'existing'; clientId: string }
  | { kind: 'complete'; clientId: string; missing: LoginSecretName[] };

export function planLoginClient(options: {
  clientName: string;
  clientIds: string[];
  systemInCatalog: boolean;
  secrets: Record<LoginSecretName, SecretPresence>;
}): LoginPlan {
  const { clientName, clientIds, systemInCatalog, secrets } = options;
  const present = LOGIN_SECRET_NAMES.filter(name => secrets[name].exists);

  if (clientIds.length > 1) {
    throw new Error(
      `${clientIds.length} clients in the user pool are named "${clientName}"; remove the extra ones before running this step again`,
    );
  }

  if (clientIds.length === 0) {
    if (present.length > 0) {
      throw new Error(
        `no client named "${clientName}" exists in the user pool, but ${present.join(
          ', ',
        )} already exist for this app; refusing to overwrite them`,
      );
    }
    return { kind: 'create' };
  }

  const [clientId] = clientIds;
  if (!systemInCatalog) {
    const inPlace = LOGIN_SECRET_NAMES.every(name => {
      const secret = secrets[name];
      return (
        secret.exists &&
        !secret.scheduledForDeletion &&
        secret.tags[CLIENT_ID_TAG] === clientId
      );
    });
    if (!inPlace) {
      throw new Error(
        `a client named "${clientName}" already exists in the user pool, and its three secrets are not all in place for it, so the System must be in the catalog and owned by the user before this step can use it`,
      );
    }
    return { kind: 'existing', clientId };
  }

  const missing: LoginSecretName[] = [];
  for (const name of LOGIN_SECRET_NAMES) {
    const secret = secrets[name];
    if (!secret.exists) {
      missing.push(name);
    } else if (secret.scheduledForDeletion) {
      throw new Error(
        `${name} is scheduled for deletion; restore or remove it first`,
      );
    } else if (secret.tags[CLIENT_ID_TAG] !== clientId) {
      throw new Error(
        `${name} was not written for the client named "${clientName}"; refusing to overwrite it`,
      );
    }
  }
  return missing.length === 0
    ? { kind: 'existing', clientId }
    : { kind: 'complete', clientId, missing };
}
