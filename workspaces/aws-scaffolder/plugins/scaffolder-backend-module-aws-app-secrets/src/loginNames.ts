const PLACEHOLDER_PATTERN = /\{([^{}]*)\}/g;
const DNS_LABEL_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const CLIENT_NAME_PATTERN = /^[\w+=,.@-]+$/;

export const LOGIN_PLACEHOLDERS = ['app', 'environment', 'namespace'];
export const CLIENT_NAME_MAX_LENGTH = 128;

export interface LoginNameParts {
  app: string;
  environment: string;
  namespace: string;
}

export function placeholdersIn(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER_PATTERN)].map(match => match[1]);
}

function fill(pattern: string, parts: LoginNameParts): string {
  return pattern.replace(PLACEHOLDER_PATTERN, (_, key: string) => {
    const value = parts[key as keyof LoginNameParts];
    if (value === undefined) {
      throw new Error(`the pattern uses {${key}}, which has no value`);
    }
    return value;
  });
}

export function checkLoginIdentity(parts: LoginNameParts): void {
  for (const [label, value] of [
    ['app', parts.app],
    ['namespace', parts.namespace],
  ]) {
    if (!DNS_LABEL_PATTERN.test(value)) {
      throw new Error(
        `the ${label} name "${value}" cannot be used for a login client: use lowercase letters, digits and hyphens, at most 63 characters, starting and ending with a letter or digit`,
      );
    }
  }
}

export function loginClientName(
  pattern: string,
  parts: LoginNameParts,
): string {
  const name = fill(pattern, parts);
  if (name.length > CLIENT_NAME_MAX_LENGTH || !CLIENT_NAME_PATTERN.test(name)) {
    throw new Error(
      `the login client name "${name}" is not a valid Cognito client name: at most ${CLIENT_NAME_MAX_LENGTH} letters, digits and _ + = , . @ -`,
    );
  }
  return name;
}

export function loginAppUrl(pattern: string, parts: LoginNameParts): string {
  const filled = fill(pattern, parts);
  let url: URL;
  try {
    url = new URL(filled);
  } catch {
    throw new Error(`the app URL "${filled}" is not a valid URL`);
  }
  if (url.protocol !== 'https:') {
    throw new Error(`the app URL "${filled}" must use https`);
  }
  if (url.username || url.password) {
    throw new Error(`the app URL "${filled}" must not carry credentials`);
  }
  if (url.search || url.hash || url.pathname !== '/') {
    throw new Error(
      `the app URL "${filled}" must be a bare origin, without a path, query or fragment`,
    );
  }
  return url.origin;
}
