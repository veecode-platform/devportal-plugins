import type { z as zodNamespace } from 'zod/v3';
import {
  CHECK_PATHS,
  CHECK_TARGETS,
  CONTRACT_CODES,
  DEPLOY_FILE_CODES,
  DEPLOY_RESULTS,
  PIECE_CODES,
  PIECE_RESULTS,
} from './resultFiles';

/**
 * The output schemas of both actions, built from the registry's zod. The
 * registry drops every field that is not declared here, so each field the tools
 * return is declared, and nothing else is.
 */
export type Zod = typeof zodNamespace;

export const WAIT_STATES = [
  'waiting_for_push',
  'checking',
  'merging',
  'deploying',
  'published',
  'merged',
  'failed',
  'blocked',
  'closed',
] as const;

export const STATUS_STATES = [
  'no_pieces',
  'not_published',
  'publishing',
  'published',
  'failed',
] as const;

export const STEPS = [
  'merge_request',
  'merge',
  'main_pipeline',
  'deploy',
] as const;
export const MAX_FAILED_JOBS = 5;
export const MAX_OPEN_REQUESTS = 5;

export const DEPLOY_OUTPUT_CODES = [...DEPLOY_FILE_CODES, 'no_detail'] as const;

export function checkOutput(z: Zod) {
  return z.object({
    target: z.enum(CHECK_TARGETS),
    path: z.enum(CHECK_PATHS),
    status: z.number().int().nullable(),
    ok: z.boolean(),
    attempts: z.number().int(),
  });
}

export function pieceOutput(z: Zod) {
  return z.object({
    piece: z.string(),
    result: z.enum(PIECE_RESULTS),
    code: z.enum(PIECE_CODES),
    checks: z.array(checkOutput(z)),
  });
}

export function chartOutput(z: Zod) {
  return z.object({
    version: z.string(),
    digest: z.string(),
  });
}

export function deployOutput(z: Zod) {
  return z.object({
    commit: z.string(),
    environment: z.string().optional(),
    result: z.enum(DEPLOY_RESULTS),
    code: z.enum(DEPLOY_OUTPUT_CODES),
    chart: chartOutput(z).optional(),
    pieces: z.array(pieceOutput(z)),
  });
}

export function failedJobOutput(z: Zod) {
  return z.object({
    name: z.string(),
    stage: z.string(),
    failureReason: z.string().optional(),
    webUrl: z.string(),
    code: z.enum(CONTRACT_CODES).optional(),
    paths: z.array(z.string()).optional(),
    logTail: z
      .array(z.string())
      .optional()
      .describe(
        'The end of the job log, only for a failure with no fixed explanation. Never relay it without checking it for a secret.',
      ),
  });
}

export function pipelineOutput(z: Zod) {
  return z.object({
    id: z.number().int(),
    commit: z.string(),
    ref: z.string(),
    status: z.string(),
    webUrl: z.string(),
  });
}

export function mergeRequestOutput(z: Zod) {
  return z.object({
    iid: z.number().int(),
    state: z.string(),
    autoMerge: z.boolean(),
    mergeStatus: z.string(),
    webUrl: z.string(),
  });
}

export function waitOutput(z: Zod) {
  return z.object({
    done: z.boolean(),
    state: z.enum(WAIT_STATES),
    step: z.enum(STEPS).optional(),
    commit: z.string(),
    followedCommit: z.string().optional(),
    mergeRequest: mergeRequestOutput(z).optional(),
    pipeline: pipelineOutput(z).optional(),
    failedJobs: z.array(failedJobOutput(z)).max(MAX_FAILED_JOBS).optional(),
    deploy: deployOutput(z).optional(),
    nextStep: z.string(),
  });
}

export function addressOutput(z: Zod) {
  return z.object({
    url: z.string(),
    title: z.string().optional(),
  });
}

export function lastDeployOutput(z: Zod) {
  return z.object({
    commit: z.string(),
    finishedAt: z.string().optional(),
    pipelineUrl: z.string(),
    jobUrl: z.string(),
    result: z.enum(DEPLOY_RESULTS),
    code: z.enum(DEPLOY_OUTPUT_CODES),
    chart: chartOutput(z).optional(),
    pieces: z.array(pieceOutput(z)),
  });
}

export function statusOutput(z: Zod) {
  return z.object({
    app: z.string(),
    description: z.string().optional(),
    repository: z
      .object({
        webUrl: z.string(),
        defaultBranch: z.string(),
      })
      .optional(),
    portalUrl: z.string().optional(),
    pieces: z.array(
      z.object({
        entityRef: z.string(),
        title: z.string().optional(),
        templateVersion: z.string().optional(),
        dashboardUrl: z.string().optional(),
      }),
    ),
    environments: z.array(
      z.object({
        name: z.string(),
        addresses: z.array(addressOutput(z)),
        lastDeploy: lastDeployOutput(z).optional(),
      }),
    ),
    latestMain: z
      .object({
        commit: z.string(),
        status: z.string(),
        webUrl: z.string(),
        failedJobs: z.array(failedJobOutput(z)).max(MAX_FAILED_JOBS).optional(),
      })
      .optional(),
    openRequests: z
      .array(
        z.object({
          iid: z.number().int(),
          title: z.string(),
          webUrl: z.string(),
          headCommit: z.string(),
          pipelineStatus: z.string(),
          autoMerge: z.boolean(),
          mergeStatus: z.string(),
          failedJobs: z
            .array(failedJobOutput(z))
            .max(MAX_FAILED_JOBS)
            .optional(),
        }),
      )
      .max(MAX_OPEN_REQUESTS),
    state: z.enum(STATUS_STATES),
    nextStep: z.string(),
  });
}
