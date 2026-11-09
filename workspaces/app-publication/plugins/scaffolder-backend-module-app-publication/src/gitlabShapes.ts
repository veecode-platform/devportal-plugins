import { z } from 'zod/v3';

/** The GitLab fields this module reads. Everything else in a response is dropped. */

export const pipelineShape = z
  .object({
    id: z.number().int(),
    sha: z.string(),
    ref: z.string().optional(),
    status: z.string(),
    web_url: z.string(),
  })
  .passthrough();

export const jobShape = z
  .object({
    id: z.number().int(),
    name: z.string(),
    stage: z.string(),
    status: z.string(),
    allow_failure: z.boolean().optional(),
    failure_reason: z.string().nullish(),
    web_url: z.string(),
    ref: z.string().optional(),
    finished_at: z.string().nullish(),
    pipeline: z
      .object({
        id: z.number().int(),
        sha: z.string().optional(),
      })
      .passthrough()
      .nullish(),
  })
  .passthrough();

export const mergeRequestShape = z
  .object({
    iid: z.number().int(),
    title: z.string().optional(),
    state: z.string(),
    sha: z.string(),
    target_branch: z.string().optional(),
    web_url: z.string(),
    merge_when_pipeline_succeeds: z.boolean().optional(),
    detailed_merge_status: z.string().optional(),
    merge_commit_sha: z.string().nullish(),
    squash_commit_sha: z.string().nullish(),
    head_pipeline: pipelineShape.nullish(),
  })
  .passthrough();

export const commitMergeRequestShape = z
  .object({
    iid: z.number().int(),
    state: z.string(),
    target_branch: z.string(),
    sha: z.string().optional(),
  })
  .passthrough();

export const projectShape = z
  .object({
    default_branch: z.string().nullish(),
    web_url: z.string(),
  })
  .passthrough();

export const diffShape = z
  .object({
    new_path: z.string().optional(),
    old_path: z.string().optional(),
  })
  .passthrough();

export type PipelineShape = z.infer<typeof pipelineShape>;
export type JobShape = z.infer<typeof jobShape>;
export type MergeRequestShape = z.infer<typeof mergeRequestShape>;
