import type { AppSecretsSettings } from './config';

const SECRET_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const SECRET_PATH_PATTERN = /^[A-Za-z0-9/_+=.@-]{1,512}$/;
const PLACEHOLDER_PATTERN = /\{([^{}]*)\}/g;
const AWS_NAME_CHARACTERS_PATTERN = /[^\w+=,.@-]/g;
export const AWS_NAME_MAX_LENGTH = 64;

export interface SecretPathParts {
  app: string;
  environment: string;
  name: string;
  cluster?: string;
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

export function buildSecretPath(
  pattern: string,
  parts: SecretPathParts,
): string {
  const path = pattern.replace(PLACEHOLDER_PATTERN, (_, key: string) => {
    const value = parts[key as keyof SecretPathParts];
    if (value === undefined) {
      throw new Error(`the path pattern uses {${key}}, which has no value`);
    }
    return value;
  });
  if (!SECRET_PATH_PATTERN.test(path)) {
    throw new Error(
      `the secret path "${path}" is not a valid Secrets Manager name`,
    );
  }
  return path;
}

/** STS rejects any other character in a session name or source identity. */
export function awsName(value: string, maxLength: number): string {
  return value.replace(AWS_NAME_CHARACTERS_PATTERN, '-').slice(0, maxLength);
}
