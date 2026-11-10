import type { Config } from '@backstage/config';
import { z } from 'zod';
import {
  LOGIN_PLACEHOLDERS,
  loginAppUrl,
  loginClientName,
  placeholdersIn,
} from './loginNames';

const ROLE_ARN_PATTERN = /^arn:aws[a-zA-Z-]*:iam::\d{12}:role\/.+$/;
const ENVIRONMENT_PATTERN = /^[a-z][a-z0-9-]*$/;
const PATH_CHARACTERS_PATTERN = /^[A-Za-z0-9/_+=.@{}-]+$/;
const DECLARATION_CHARACTERS_PATTERN = /^[A-Za-z0-9._/{}-]+$/;
const USER_POOL_ID_PATTERN = /^[a-z0-9-]+_[A-Za-z0-9]+$/;
const REGION_PATTERN = /^[a-z0-9-]+$/;
const CLIENT_NAME_CHARACTERS_PATTERN = /^[\w+=,.@{}-]+$/;
const IDENTITY_PROVIDER_PATTERN = /^[\w.-]{1,32}$/;
const PATH_PLACEHOLDERS = [
  'app',
  'environment',
  'name',
  'cluster',
  'namespace',
];
const REQUIRED_PATH_PLACEHOLDERS = ['app', 'environment', 'name'];
const DECLARATION_PLACEHOLDERS = ['environment'];
export const DEFAULT_DECLARATION_FILE = 'config/{environment}.yaml';
export const DEFAULT_CLIENT_NAME_PATTERN = '{app}-{environment}';
export const DEFAULT_IDENTITY_PROVIDERS = ['Google'];
/** Stand-ins that show whether a login pattern can produce a valid name or URL. */
const LOGIN_PROBE = {
  app: 'example-app',
  environment: 'dev',
  namespace: 'default',
};

/**
 * The scopes, flows and token lifetimes of the app clients are fixed in code,
 * so the block takes none: a `scopes` key is refused as an unknown key, and
 * `aws.cognito.signin.user.admin` cannot be added from configuration.
 */
const loginSchema = z
  .object({
    userPoolId: z
      .string()
      .regex(
        USER_POOL_ID_PATTERN,
        'must be a Cognito user pool ID: <region>_<id>',
      ),
    region: z
      .string()
      .regex(REGION_PATTERN, 'must be an AWS region such as us-east-1')
      .optional(),
    appUrlPattern: z.string().min(1),
    clientNamePattern: z
      .string()
      .regex(
        CLIENT_NAME_CHARACTERS_PATTERN,
        'may contain only letters, digits, _ + = , . @ - and {placeholders}',
      )
      .default(DEFAULT_CLIENT_NAME_PATTERN),
    identityProviders: z
      .array(
        z
          .string()
          .regex(
            IDENTITY_PROVIDER_PATTERN,
            'must be an identity provider name of at most 32 letters, digits, _ . -',
          ),
      )
      .min(1)
      .refine(
        providers => new Set(providers).size === providers.length,
        'lists an identity provider more than once',
      )
      .default(DEFAULT_IDENTITY_PROVIDERS),
  })
  .strict();

const settingsSchema = z
  .object({
    region: z.string().min(1),
    writerRoleArn: z
      .string()
      .regex(
        ROLE_ARN_PATTERN,
        'must be an IAM role ARN: arn:aws:iam::<account>:role/<name>',
      ),
    pathPattern: z
      .string()
      .regex(
        PATH_CHARACTERS_PATTERN,
        'may contain only letters, digits, / _ + = . @ - and {placeholders}',
      ),
    cluster: z.string().min(1).optional(),
    environments: z
      .array(
        z
          .string()
          .regex(
            ENVIRONMENT_PATTERN,
            'must start with a lowercase letter and contain only lowercase letters, digits and hyphens',
          ),
      )
      .min(1)
      .refine(
        environments => new Set(environments).size === environments.length,
        'lists an environment more than once',
      ),
    declarationFile: z
      .string()
      .regex(
        DECLARATION_CHARACTERS_PATTERN,
        'may contain only letters, digits, . _ / - and {environment}',
      )
      .default(DEFAULT_DECLARATION_FILE),
    reservedNames: z.array(z.string().min(1)),
    reservedPrefixes: z.array(z.string().min(1)),
    login: loginSchema.optional(),
  })
  .strict()
  .superRefine((settings, context) => {
    const pathPlaceholders = placeholdersIn(settings.pathPattern);
    for (const placeholder of pathPlaceholders) {
      if (!PATH_PLACEHOLDERS.includes(placeholder)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['pathPattern'],
          message: `uses the unknown placeholder {${placeholder}}; allowed: {app}, {environment}, {name}, {cluster}, {namespace}`,
        });
      }
    }
    for (const placeholder of REQUIRED_PATH_PLACEHOLDERS) {
      if (!pathPlaceholders.includes(placeholder)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['pathPattern'],
          message: `must contain {${placeholder}}`,
        });
      }
    }
    if (
      pathPlaceholders.includes('cluster') &&
      settings.cluster === undefined
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cluster'],
        message: 'is required because pathPattern uses {cluster}',
      });
    }

    const declarationFile = settings.declarationFile;
    if (declarationFile.startsWith('/')) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['declarationFile'],
        message: 'must be relative to the folder of each component',
      });
    }
    if (declarationFile.split('/').includes('..')) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['declarationFile'],
        message: 'must not contain a .. segment',
      });
    }
    const declarationPlaceholders = placeholdersIn(declarationFile);
    if (!declarationPlaceholders.includes('environment')) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['declarationFile'],
        message: 'must contain {environment}',
      });
    }
    for (const placeholder of declarationPlaceholders) {
      if (!DECLARATION_PLACEHOLDERS.includes(placeholder)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['declarationFile'],
          message: `uses the unknown placeholder {${placeholder}}; allowed: {environment}`,
        });
      }
    }

    if (settings.login) {
      checkLogin(settings.login, settings.region, context);
    }
  })
  .transform(({ login, ...settings }) => ({
    ...settings,
    ...(login
      ? { login: { ...login, region: login.region ?? settings.region } }
      : {}),
  }));

/** Where and how the app login clients are created. */
export type LoginSettings = {
  userPoolId: string;
  region: string;
  appUrlPattern: string;
  clientNamePattern: string;
  identityProviders: string[];
};

export type AppSecretsSettings = Omit<
  z.infer<typeof settingsSchema>,
  'login'
> & { login?: LoginSettings };

function checkLogin(
  login: z.infer<typeof loginSchema>,
  defaultRegion: string,
  context: z.RefinementCtx,
): void {
  const issue = (path: string, message: string) =>
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['login', path],
      message,
    });

  const region = login.region ?? defaultRegion;
  if (login.userPoolId.split('_')[0] !== region) {
    issue(
      'userPoolId',
      `belongs to another region than "${region}", the region of the login block`,
    );
  }

  const clientPlaceholders = placeholdersIn(login.clientNamePattern);
  for (const placeholder of clientPlaceholders) {
    if (!LOGIN_PLACEHOLDERS.includes(placeholder)) {
      issue(
        'clientNamePattern',
        `uses the unknown placeholder {${placeholder}}; allowed: {app}, {environment}, {namespace}`,
      );
    }
  }
  for (const placeholder of ['app', 'environment']) {
    if (!clientPlaceholders.includes(placeholder)) {
      issue('clientNamePattern', `must contain {${placeholder}}`);
    }
  }

  const urlPlaceholders = placeholdersIn(login.appUrlPattern);
  for (const placeholder of urlPlaceholders) {
    if (!LOGIN_PLACEHOLDERS.includes(placeholder)) {
      issue(
        'appUrlPattern',
        `uses the unknown placeholder {${placeholder}}; allowed: {app}, {environment}, {namespace}`,
      );
    }
  }
  if (!urlPlaceholders.includes('app')) {
    issue('appUrlPattern', 'must contain {app}');
  }

  if (
    clientPlaceholders.every(item => LOGIN_PLACEHOLDERS.includes(item)) &&
    urlPlaceholders.every(item => LOGIN_PLACEHOLDERS.includes(item))
  ) {
    try {
      loginClientName(login.clientNamePattern, LOGIN_PROBE);
    } catch (error) {
      issue(
        'clientNamePattern',
        `gives a client name Cognito would refuse: ${errorMessage(error)}`,
      );
    }
    try {
      loginAppUrl(login.appUrlPattern, LOGIN_PROBE);
    } catch (error) {
      issue(
        'appUrlPattern',
        `gives an app URL the login cannot use: ${errorMessage(error)}`,
      );
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'is not valid';
}

/**
 * Reads `appSecrets` once at start. A missing or malformed entry stops the
 * backend before any template or action runs.
 */
export function readAppSecretsConfig(config: Config): AppSecretsSettings {
  const raw = config.getOptional('appSecrets');
  if (raw === undefined) {
    throw new Error(
      'appSecrets is not configured: the app-secrets module cannot start without it',
    );
  }
  const parsed = settingsSchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map(issue => {
        const path = issue.path.join('.');
        return `appSecrets${path ? `.${path}` : ''} ${issue.message}`;
      })
      .join('; ');
    throw new Error(details);
  }
  return parsed.data;
}
