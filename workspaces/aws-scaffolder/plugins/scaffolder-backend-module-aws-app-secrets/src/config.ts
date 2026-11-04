import type { Config } from '@backstage/config';
import { z } from 'zod';

const ROLE_ARN_PATTERN = /^arn:aws[a-zA-Z-]*:iam::\d{12}:role\/.+$/;
const ENVIRONMENT_PATTERN = /^[a-z][a-z0-9-]*$/;
const PATH_CHARACTERS_PATTERN = /^[A-Za-z0-9/_+=.@{}-]+$/;
const DECLARATION_CHARACTERS_PATTERN = /^[A-Za-z0-9._/{}-]+$/;
const PLACEHOLDER_PATTERN = /\{([^{}]*)\}/g;
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

function placeholdersIn(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER_PATTERN)].map(match => match[1]);
}

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
  });

export type AppSecretsSettings = z.infer<typeof settingsSchema>;

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
