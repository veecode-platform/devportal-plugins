import type { Config } from '@backstage/config';
import { z } from 'zod/v3';

const JOB_OR_ARTIFACT_PATTERN = /^[A-Za-z0-9._:/-]{1,255}$/;
const KEY_PATTERN = /^[A-Za-z0-9._/-]{1,253}$/;
const ENVIRONMENT_PATTERN = /^[a-z][a-z0-9-]{0,30}$/;
const GROUP_PATH_PATTERN = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;
export const DEFAULT_DEPLOY_JOB = 'deploy';
export const DEFAULT_DEPLOY_ARTIFACT = 'smoke-result.json';
export const DEFAULT_CONTRACT_JOB = 'contract';
export const DEFAULT_CONTRACT_ARTIFACT = 'contract-result.json';
export const DEFAULT_CONFLICT_JOB = 'conflict-markers';
export const DEFAULT_ADDRESS_LINK_TYPE = 'app-address';
export const DEFAULT_DASHBOARD_ANNOTATION = 'grafana/overview-dashboard';

const settingsSchema = z
  .object({
    projectPathPrefix: z
      .string()
      .regex(
        GROUP_PATH_PATTERN,
        'must be a GitLab group path such as example-org, with no leading or trailing slash',
      )
      .refine(
        prefix =>
          !prefix
            .split('/')
            .some(segment => segment === '..' || segment === '.'),
        'must not contain a . or .. segment',
      ),
    deployJobName: z
      .string()
      .regex(
        JOB_OR_ARTIFACT_PATTERN,
        'may contain only letters, digits and . _ : / -',
      )
      .default(DEFAULT_DEPLOY_JOB),
    deployResultArtifact: z
      .string()
      .regex(
        JOB_OR_ARTIFACT_PATTERN,
        'may contain only letters, digits and . _ : / -',
      )
      .default(DEFAULT_DEPLOY_ARTIFACT),
    contractJobName: z
      .string()
      .regex(
        JOB_OR_ARTIFACT_PATTERN,
        'may contain only letters, digits and . _ : / -',
      )
      .default(DEFAULT_CONTRACT_JOB),
    contractResultArtifact: z
      .string()
      .regex(
        JOB_OR_ARTIFACT_PATTERN,
        'may contain only letters, digits and . _ : / -',
      )
      .default(DEFAULT_CONTRACT_ARTIFACT),
    conflictMarkersJobName: z
      .string()
      .regex(
        JOB_OR_ARTIFACT_PATTERN,
        'may contain only letters, digits and . _ : / -',
      )
      .default(DEFAULT_CONFLICT_JOB),
    maxWaitSeconds: z.number().int().min(1).max(270).default(20),
    pollIntervalSeconds: z.number().int().min(2).max(60).default(5),
    maxArtifactBytes: z.number().int().min(1024).max(1048576).default(65536),
    failedJobLogLines: z.number().int().min(1).max(200).default(40),
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
      )
      .default(['dev']),
    addressLinkType: z
      .string()
      .regex(KEY_PATTERN, 'may contain only letters, digits and . _ / -')
      .default(DEFAULT_ADDRESS_LINK_TYPE),
    dashboardAnnotation: z
      .string()
      .regex(KEY_PATTERN, 'may contain only letters, digits and . _ / -')
      .default(DEFAULT_DASHBOARD_ANNOTATION),
  })
  .strict()
  .refine(settings => settings.pollIntervalSeconds < settings.maxWaitSeconds, {
    message: 'must be below maxWaitSeconds',
    path: ['pollIntervalSeconds'],
  });

export type AppPublicationSettings = z.infer<typeof settingsSchema>;

/**
 * Reads `appPublication` once at start. Every key has a default, so a missing
 * block is valid. A wrong value stops the backend before the first call.
 */
export function readAppPublicationConfig(
  config: Config,
): AppPublicationSettings {
  const raw = config.getOptional('appPublication') ?? {};
  const parsed = settingsSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues
        .map(issue => {
          const path = issue.path.join('.');
          return `appPublication${path ? `.${path}` : ''} ${issue.message}`;
        })
        .join('; '),
    );
  }
  return parsed.data;
}
