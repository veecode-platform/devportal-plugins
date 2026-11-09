import { z } from 'zod/v3';
import { type Clock } from './dependencies';
import {
  describeFailedJobs,
  type DeployStep,
  type FailureContext,
  noDetailStep,
  readDeployStep,
  type RequestFailure,
} from './failures';
import {
  commitMergeRequestShape,
  diffShape,
  jobShape,
  type JobShape,
  mergeRequestShape,
  type MergeRequestShape,
  pipelineShape,
  type PipelineShape,
} from './gitlabShapes';
import * as S from './sentences';
import type {
  FailedJob,
  MergeRequestOut,
  PipelineOut,
  WaitOutput,
} from './types';

/** Pipeline states that have not finished yet. */
export const RUNNING_STATES = [
  'created',
  'waiting_for_resource',
  'preparing',
  'pending',
  'running',
  'scheduled',
];
const DEPLOY_RUNNING_STATES = [...RUNNING_STATES, 'manual'];
const FINISHED_DEPLOY_STATES = ['success', 'failed', 'skipped', 'canceled'];
const MAX_FOLLOWED_COMMITS = 3;
const SAFE_WORD = /^[a-z_]{1,40}$/;

export interface Observation {
  done: boolean;
  state: WaitOutput['state'];
  step?: WaitOutput['step'];
  followedCommit?: string;
  mergeRequest?: MergeRequestOut;
  pipeline?: PipelineOut;
  failedJobs?: FailedJob[];
  deploy?: WaitOutput['deploy'];
  nextStep: string;
}

export function encodeRef(ref: string): string {
  return encodeURIComponent(ref);
}

export function pipelineOut(
  pipeline: PipelineShape,
  defaultBranch: string,
): PipelineOut {
  return {
    id: pipeline.id,
    commit: pipeline.sha,
    ref: pipeline.ref ?? defaultBranch,
    status: pipeline.status,
    webUrl: pipeline.web_url,
  };
}

export function mergeRequestOut(mr: MergeRequestShape): MergeRequestOut {
  const status = mr.detailed_merge_status ?? 'unknown';
  return {
    iid: mr.iid,
    state: mr.state,
    autoMerge: mr.merge_when_pipeline_succeeds ?? false,
    mergeStatus: SAFE_WORD.test(status) ? status : 'unknown',
    webUrl: mr.web_url,
  };
}

export async function pipelineJobs(
  ctx: FailureContext,
  pipelineId: number,
): Promise<JobShape[]> {
  return (
    (await ctx.gitlab.json(
      `/pipelines/${pipelineId}/jobs?per_page=100`,
      z.array(jobShape),
    )) ?? []
  );
}

/** The request's changed paths, read from GitLab's own diff and only when a contract failure needs them. */
export function requestFailure(
  ctx: FailureContext,
  iid: number,
): RequestFailure {
  let loaded: Promise<ReadonlySet<string>> | undefined;
  return {
    iid,
    diffPaths() {
      loaded ??= ctx.gitlab
        .json(`/merge_requests/${iid}/diffs?per_page=100`, z.array(diffShape))
        .then(diffs => {
          const paths = new Set<string>();
          for (const diff of diffs ?? []) {
            if (diff.new_path) paths.add(diff.new_path);
            if (diff.old_path) paths.add(diff.old_path);
          }
          return paths;
        });
      return loaded;
    },
  };
}

function waitingForPush(commit: string): Observation {
  return {
    done: false,
    state: 'waiting_for_push',
    nextStep: S.WAITING_FOR_PUSH(commit),
  };
}

/** Which of the target branch's requests holds the commit: the one named, else the open one, else the newest. */
function chooseRequest<T extends { iid: number; state: string }>(
  targets: readonly T[],
  named: number | undefined,
): T | undefined {
  if (named !== undefined) {
    return targets.find(target => target.iid === named);
  }
  const ordered = [...targets].sort((a, b) => b.iid - a.iid);
  return ordered.find(target => target.state === 'opened') ?? ordered[0];
}

/** One read of GitLab, with no waiting: where the commit's change stands right now. */
export async function observeCommit(
  ctx: FailureContext,
  input: { commit: string; mergeRequest?: number },
): Promise<Observation> {
  const listed = await ctx.gitlab.json(
    `/repository/commits/${input.commit}/merge_requests`,
    z.array(commitMergeRequestShape),
  );
  const targets = (listed ?? []).filter(
    request => request.target_branch === ctx.defaultBranch,
  );
  const chosen = chooseRequest(targets, input.mergeRequest);
  if (chosen === undefined) {
    return waitingForPush(input.commit);
  }
  const mr = await ctx.gitlab.json(
    `/merge_requests/${chosen.iid}`,
    mergeRequestShape,
  );
  if (mr === undefined) {
    return waitingForPush(input.commit);
  }
  const followedCommit = mr.sha !== input.commit ? mr.sha : undefined;
  const request = mergeRequestOut(mr);

  if (mr.state === 'closed') {
    return {
      done: true,
      state: 'closed',
      mergeRequest: request,
      followedCommit,
      nextStep: S.SENTENCE.closed,
    };
  }
  if (mr.state === 'merged') {
    const landed = mr.merge_commit_sha ?? mr.squash_commit_sha ?? mr.sha;
    const after = await observeDefaultBranch(ctx, landed);
    return {
      ...after,
      mergeRequest: request,
      followedCommit: after.followedCommit ?? followedCommit,
    };
  }
  return observeOpenRequest(ctx, mr, request, followedCommit);
}

async function observeOpenRequest(
  ctx: FailureContext,
  mr: MergeRequestShape,
  request: MergeRequestOut,
  followedCommit: string | undefined,
): Promise<Observation> {
  const head = mr.head_pipeline;
  const checking: Observation = {
    done: false,
    state: 'checking',
    mergeRequest: request,
    followedCommit,
    nextStep: S.SENTENCE.checking,
  };
  if (!head || head.sha !== mr.sha) {
    return checking;
  }
  const pipeline = pipelineOut(
    { ...head, ref: head.ref ?? ctx.defaultBranch },
    ctx.defaultBranch,
  );
  if (RUNNING_STATES.includes(head.status)) {
    return { ...checking, pipeline };
  }
  if (head.status === 'failed') {
    const jobs = await pipelineJobs(ctx, head.id);
    const described = await describeFailedJobs(
      ctx,
      jobs,
      requestFailure(ctx, mr.iid),
    );
    return {
      done: true,
      state: 'failed',
      step: 'merge_request',
      mergeRequest: request,
      pipeline,
      followedCommit,
      failedJobs: described.failedJobs,
      nextStep:
        described.sentences.length > 0
          ? described.sentences.join(' ')
          : S.REQUEST_PIPELINE_FAILED_NO_JOB(head.web_url),
    };
  }
  if (head.status === 'canceled' || head.status === 'skipped') {
    return {
      done: true,
      state: 'blocked',
      mergeRequest: request,
      pipeline,
      followedCommit,
      nextStep: S.SENTENCE.requestPipelineEnded,
    };
  }
  if (head.status !== 'success') {
    return { ...checking, pipeline };
  }

  const blocked = (nextStep: string): Observation => ({
    done: true,
    state: 'blocked',
    mergeRequest: request,
    pipeline,
    followedCommit,
    nextStep,
  });
  switch (mr.detailed_merge_status) {
    case 'need_rebase':
      return blocked(S.SENTENCE.needRebase);
    case 'conflict':
      return blocked(S.SENTENCE.conflict);
    case 'draft_status':
      return blocked(S.SENTENCE.draft);
    default:
      break;
  }
  if (mr.merge_when_pipeline_succeeds === false) {
    return blocked(S.SENTENCE.autoMergeOff);
  }
  return {
    done: false,
    state: 'merging',
    mergeRequest: request,
    pipeline,
    followedCommit,
    nextStep: S.MERGE_STUCK(request.mergeStatus),
  };
}

/** The default branch's pipeline for the landed commit, and its deploy job. */
async function observeDefaultBranch(
  ctx: FailureContext,
  landed: string,
): Promise<Observation> {
  let commit = landed;
  let followedCommit: string | undefined;
  const deploying = (pipeline?: PipelineOut): Observation => ({
    done: false,
    state: 'deploying',
    pipeline,
    followedCommit,
    nextStep: S.SENTENCE.deploying,
  });

  for (let hop = 0; hop <= MAX_FOLLOWED_COMMITS; hop += 1) {
    const pipelines =
      (await ctx.gitlab.json(
        `/pipelines?ref=${encodeRef(
          ctx.defaultBranch,
        )}&sha=${commit}&order_by=id&sort=desc&per_page=1`,
        z.array(pipelineShape),
      )) ?? [];
    const pipeline = pipelines[0];
    if (pipeline === undefined) {
      return deploying();
    }
    const out = pipelineOut(pipeline, ctx.defaultBranch);
    const jobs = await pipelineJobs(ctx, pipeline.id);
    const deployJob = newest(
      jobs.filter(job => job.name === ctx.settings.deployJobName),
    );

    if (deployJob === undefined) {
      if (DEPLOY_RUNNING_STATES.includes(pipeline.status)) {
        return deploying(out);
      }
      if (pipeline.status === 'success') {
        return {
          done: true,
          state: 'merged',
          pipeline: out,
          followedCommit,
          nextStep: S.SENTENCE.merged,
        };
      }
      if (pipeline.status === 'failed') {
        const described = await describeFailedJobs(ctx, jobs);
        return {
          done: true,
          state: 'failed',
          step: 'main_pipeline',
          pipeline: out,
          followedCommit,
          failedJobs: described.failedJobs,
          nextStep:
            described.sentences.length > 0
              ? described.sentences.join(' ')
              : S.DEFAULT_PIPELINE_FAILED_NO_JOB(pipeline.web_url),
        };
      }
      if (pipeline.status === 'canceled' || pipeline.status === 'skipped') {
        return {
          done: true,
          state: 'failed',
          step: 'main_pipeline',
          pipeline: out,
          followedCommit,
          nextStep: S.DEFAULT_PIPELINE_ENDED(commit, pipeline.web_url),
        };
      }
      return deploying(out);
    }

    if (!FINISHED_DEPLOY_STATES.includes(deployJob.status)) {
      return deploying(out);
    }
    const step = await readDeployStep(ctx, deployJob, pipeline);
    if (step.kind === 'superseded') {
      const latestMain = await ctx.gitlab.json(
        `/pipelines?ref=${encodeRef(
          ctx.defaultBranch,
        )}&order_by=id&sort=desc&per_page=1`,
        z.array(pipelineShape),
      );
      const next = latestMain?.[0];
      if (next === undefined || next.sha === commit) {
        return deployFailure(
          ctx,
          pipeline,
          followedCommit,
          await noDetailStep(ctx, deployJob, pipeline),
        );
      }
      commit = next.sha;
      followedCommit = next.sha;
      continue;
    }
    if (step.kind === 'published') {
      return {
        done: true,
        state: 'published',
        pipeline: out,
        followedCommit,
        deploy: step.deploy,
        nextStep: S.SENTENCE.published,
      };
    }
    return deployFailure(ctx, pipeline, followedCommit, step);
  }
  return deploying();
}

function deployFailure(
  ctx: FailureContext,
  pipeline: PipelineShape,
  followedCommit: string | undefined,
  step: Extract<DeployStep, { kind: 'failed' }>,
): Observation {
  return {
    done: true,
    state: 'failed',
    step: 'deploy',
    pipeline: pipelineOut(pipeline, ctx.defaultBranch),
    followedCommit,
    deploy: step.deploy,
    failedJobs: step.failedJobs,
    nextStep: step.sentence,
  };
}

function newest(jobs: readonly JobShape[]): JobShape | undefined {
  return [...jobs].sort((a, b) => b.id - a.id)[0];
}

/**
 * Reads the request's state until it finishes or the deadline passes, polling
 * every `pollMilliseconds`. The last observation is returned as it stands.
 */
export async function waitForPublication(
  ctx: FailureContext,
  input: { commit: string; mergeRequest?: number },
  options: { clock: Clock; deadline: number; pollMilliseconds: number },
): Promise<WaitOutput> {
  for (;;) {
    const observation = await observeCommit(ctx, input);
    if (
      observation.done ||
      options.clock.now() + options.pollMilliseconds >= options.deadline
    ) {
      return toWaitOutput(observation, input.commit);
    }
    await options.clock.sleep(options.pollMilliseconds);
  }
}

export function toWaitOutput(
  observation: Observation,
  commit: string,
): WaitOutput {
  return {
    done: observation.done,
    state: observation.state,
    ...(observation.step !== undefined ? { step: observation.step } : {}),
    commit,
    ...(observation.followedCommit !== undefined
      ? { followedCommit: observation.followedCommit }
      : {}),
    ...(observation.mergeRequest !== undefined
      ? { mergeRequest: observation.mergeRequest }
      : {}),
    ...(observation.pipeline !== undefined
      ? { pipeline: observation.pipeline }
      : {}),
    ...(observation.failedJobs !== undefined
      ? { failedJobs: observation.failedJobs }
      : {}),
    ...(observation.deploy !== undefined ? { deploy: observation.deploy } : {}),
    nextStep: observation.nextStep,
  };
}
