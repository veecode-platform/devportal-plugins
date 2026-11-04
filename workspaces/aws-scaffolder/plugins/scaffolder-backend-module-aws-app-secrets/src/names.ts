import { type Entity, stringifyEntityRef } from '@backstage/catalog-model';
import type { AppSecretsSettings } from './config';

const SECRET_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const SECRET_PATH_PATTERN = /^[A-Za-z0-9/_+=.@-]{1,512}$/;
const PLACEHOLDER_PATTERN = /\{([^{}]*)\}/g;
const AWS_NAME_CHARACTERS_PATTERN = /[^\w+=,.@-]/g;
export const AWS_NAME_MAX_LENGTH = 64;
export const DEFAULT_NAMESPACE = 'default';

export interface SecretPathParts {
  app: string;
  environment: string;
  name: string;
  cluster?: string;
  namespace: string;
}

/** The System's name and namespace, as the path pattern names them. */
export interface SystemPathIdentity {
  app: string;
  namespace: string;
}

export function checkSecretName(
  name: string,
  settings: AppSecretsSettings,
): void {
  if (!SECRET_NAME_PATTERN.test(name)) {
    throw new Error(
      `name "${name}" must be upper case letters, digits and underscores, starting with a letter`,
    );
  }
  if (settings.reservedNames.includes(name)) {
    throw new Error(`name "${name}" is reserved for the platform`);
  }
  const prefix = settings.reservedPrefixes.find(candidate =>
    name.startsWith(candidate),
  );
  if (prefix !== undefined) {
    throw new Error(
      `name "${name}" starts with the reserved prefix "${prefix}"`,
    );
  }
}

/**
 * The name and namespace of a System as the path pattern uses them. A pattern
 * without {namespace} cannot tell a System outside "default" from the System of
 * the same name inside it, so such a System is refused here, before any AWS call.
 */
export function pathIdentity(
  system: Entity,
  pattern: string,
): SystemPathIdentity {
  const app = system.metadata.name;
  const namespace = system.metadata.namespace ?? DEFAULT_NAMESPACE;
  if (namespace !== DEFAULT_NAMESPACE && !pattern.includes('{namespace}')) {
    const ref = stringifyEntityRef({ kind: 'system', namespace, name: app });
    throw new Error(
      `System "${ref}" is outside the "${DEFAULT_NAMESPACE}" namespace, and appSecrets.pathPattern has no {namespace}: its secrets would share paths with a System of the same name in "${DEFAULT_NAMESPACE}". Add {namespace} to appSecrets.pathPattern to register them.`,
    );
  }
  return { app, namespace };
}

function fillPattern(
  pattern: string,
  values: Partial<SecretPathParts>,
): string {
  return pattern.replace(PLACEHOLDER_PATTERN, (_, key: string) => {
    const value = values[key as keyof SecretPathParts];
    if (value === undefined) {
      throw new Error(`the path pattern uses {${key}}, which has no value`);
    }
    return value;
  });
}

export function buildSecretPath(
  pattern: string,
  parts: SecretPathParts,
): string {
  const path = fillPattern(pattern, parts);
  if (!SECRET_PATH_PATTERN.test(path)) {
    throw new Error(
      `the secret path "${path}" is not a valid Secrets Manager name`,
    );
  }
  return path;
}

/**
 * Every path one environment of an app can produce, with {name} open as `*`.
 * The name is the only wildcard: the other parts are checked as plain path
 * characters by building the path with a placeholder name first.
 */
export function secretPathGlob(
  pattern: string,
  parts: Omit<SecretPathParts, 'name'>,
): string {
  buildSecretPath(pattern, { ...parts, name: 'NAME' });
  return fillPattern(pattern, { ...parts, name: '*' });
}

/** STS rejects any other character in a session name or source identity. */
export function awsName(value: string, maxLength: number): string {
  return value.replace(AWS_NAME_CHARACTERS_PATTERN, '-').slice(0, maxLength);
}
