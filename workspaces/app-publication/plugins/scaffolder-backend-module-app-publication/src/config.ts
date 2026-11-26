import type { Config } from '@backstage/config';
import { z } from 'zod/v3';

const JOB_OR_ARTIFACT_PATTERN = /^[A-Za-z0-9._:/-]{1,255}$/;
const KEY_PATTERN = /^[A-Za-z0-9._/-]{1,253}$/;
const ENVIRONMENT_PATTERN = /^[a-z][a-z0-9-]{0,30}$/;
const GROUP_PATH_PATTERN = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;
export const PROJECT_PATH_PATTERN = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)+$/;
export const DEFAULT_DEPLOY_JOB = 'deploy';
export const DEFAULT_DEPLOY_ARTIFACT = 'smoke-result.json';
export const DEFAULT_CONTRACT_JOB = 'contract';
export const DEFAULT_CONTRACT_ARTIFACT = 'contract-result.json';
export const DEFAULT_CONFLICT_JOB = 'conflict-markers';
export const DEFAULT_RENDER_JOB = 'render';
export const DEFAULT_KNOWN_JOB_NAMES = ['secrets:gitleaks'];
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
    renderJobName: z
      .string()
      .regex(
        JOB_OR_ARTIFACT_PATTERN,
        'may contain only letters, digits and . _ : / -',
      )
      .default(DEFAULT_RENDER_JOB),
    knownJobNames: z
      .array(
        z
          .string()
          .regex(
            JOB_OR_ARTIFACT_PATTERN,
            'may contain only letters, digits and . _ : / -',
          ),
      )
      .default(DEFAULT_KNOWN_JOB_NAMES),
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
    // Read by readAutoMergeConfig, so a wrong auto-merge block stops only that action.
    autoMerge: z.unknown().optional(),
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
    throw new Error(describeIssues('appPublication', parsed.error.issues));
  }
  return parsed.data;
}

const autoMergeSchema = z
  .object({
    allowedProjects: z
      .array(
        z
          .string()
          .regex(
            PROJECT_PATH_PATTERN,
            'must be a GitLab project path such as example-org/apps/example-app, with no leading or trailing slash',
          )
          .refine(
            path =>
              !path
                .split('/')
                .some(segment => segment === '..' || segment === '.'),
            'must not contain a . or .. segment',
          ),
      )
      .default([]),
    sourceBranchPrefixes: z
      .array(z.string().min(1, 'must not be empty'))
      .min(1, 'lists no prefix; leave the setting out to skip the check')
      .optional(),
  })
  .strict();

export type AutoMergeSettings = z.infer<typeof autoMergeSchema>;

/**
 * Reads `appPublication.autoMerge`: the projects the auto-merge template action
 * may arm. A missing block, or a missing or empty list, allows no project.
 */
export function readAutoMergeConfig(config: Config): AutoMergeSettings {
  const raw = config.getOptional('appPublication.autoMerge') ?? {};
  const parsed = autoMergeSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      describeIssues('appPublication.autoMerge', parsed.error.issues),
    );
  }
  return parsed.data;
}

function describeIssues(prefix: string, issues: z.ZodIssue[]): string {
  return issues
    .map(issue => {
      const path = issue.path.join('.');
      return `${prefix}${path ? `.${path}` : ''} ${issue.message}`;
    })
    .join('; ');
}
