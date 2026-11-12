import type { Entity } from '@backstage/catalog-model';
import { z } from 'zod/v3';
import { addressesOf } from './addresses';
import type { AppPiece } from './app';
import {
  describeFailedJobs,
  type DeployStep,
  type FailureContext,
  readDeployStep,
} from './failures';
import {
  type JobShape,
  type MergeRequestShape,
  mergeRequestShape,
  type PipelineShape,
  pipelineShape,
} from './gitlabShapes';
import { linkText, shownLink } from './links';
import {
  mergeRequestOut,
  pipelineJobs,
  RUNNING_STATES,
  requestFailure,
} from './publication';
import * as S from './sentences';
import type { FailedJob, LastDeployOut, StatusOutput } from './types';

/** The default-branch pipelines read for deploys, and the deploys kept. */
const MAX_DEPLOY_PIPELINES = 10;
const MAX_DEPLOY_JOBS = 5;
const MAX_OPEN_REQUESTS = 5;

export interface SheetInput {
  app: string;
  system: Entity;
  pieces: AppPiece[];
  projectWebUrl: string;
  portalUrl?: string;
  addressLinkType: string;
  /** True once the call's time budget is spent; reads started after it are skipped. */
  expired(): boolean;
}

type Finished = Exclude<DeployStep, { kind: 'superseded' }>;

interface DeployEntry {
  /** The environment the file names; undefined when the file is missing or invalid. */
  environment?: string;
  step: Finished;
  pipelineUrl: string;
  jobUrl?: string;
  finishedAt?: string;
}

interface Failure {
  failedJobs: FailedJob[];
  sentence: string;
}

/**
 * The app's sheet: its pieces, the last deploy of each environment, the newest
 * default-branch pipeline and the open requests. It waits for nothing. When the
 * time budget runs out, the reads not yet made are skipped and the sheet says so.
 */
export async function readSheet(
  ctx: FailureContext,
  input: SheetInput,
): Promise<StatusOutput> {
  const partial = { value: false };
  const within = async <T>(fallback: T, read: () => Promise<T>): Promise<T> => {
    if (input.expired()) {
      partial.value = true;
      return fallback;
    }
    try {
      return await read();
    } catch (error) {
      if (input.expired()) {
        partial.value = true;
        return fallback;
      }
      throw error;
    }
  };

  const branch = ctx.defaultBranch;
  const latest = await within<PipelineShape | undefined>(
    undefined,
    async () =>
      (
        await ctx.gitlab.json(
          `/pipelines?ref=${encodeURIComponent(
            branch,
          )}&order_by=id&sort=desc&per_page=1`,
          z.array(pipelineShape),
        )
      )?.[0],
  );
  const mainFail = await within<Failure | undefined>(undefined, async () =>
    latest?.status === 'failed'
      ? mainFailure(ctx, latest, await pipelineJobs(ctx, latest.id))
      : undefined,
  );
  const deployRead = await within<DeployRead>(
    { entries: [], windowFull: false },
    () =>
      recentDeploys(ctx, input, () => {
        partial.value = true;
      }),
  );
  const deploys = deployRead.entries;
  // The window of recent pipelines is full and holds no deploy: the last deploy
  // is older than what this tool reads.
  const olderThanWindow = deploys.length === 0 && deployRead.windowFull;
  const live = deploys.find(entry => entry.step.kind === 'published');
  const last = deploys[0];
  const liveSentence = live ? ` ${S.LIVE_VERSION(live.step.commit)}` : '';

  let state: StatusOutput['state'];
  let nextStep: string;
  if (ctx.pieces.size === 0) {
    state = 'no_pieces';
    nextStep = S.SENTENCE.noPieces;
  } else if (latest !== undefined && RUNNING_STATES.includes(latest.status)) {
    state = 'publishing';
    nextStep = S.PUBLICATION_RUNNING(latest.sha);
  } else if (latest !== undefined && mainFail !== undefined) {
    state = 'failed';
    nextStep = mainFail.sentence + liveSentence;
  } else if (last?.step.kind === 'failed') {
    state = 'failed';
    nextStep = last.step.sentence + liveSentence;
  } else if (last?.step.kind === 'published') {
    state = 'published';
    nextStep = S.PUBLISHED_AT(last.step.commit);
  } else {
    state = 'not_published';
    nextStep = olderThanWindow
      ? S.SENTENCE.olderDeploy
      : S.SENTENCE.notPublished;
  }
  if (olderThanWindow && state !== 'not_published') {
    nextStep = `${S.SENTENCE.olderDeploy} ${nextStep}`;
  }

  const openRequests: StatusOutput['openRequests'] = [];
  const opened = await within<MergeRequestShape[]>(
    [],
    async () =>
      (await ctx.gitlab.json(
        `/merge_requests?state=opened&order_by=created_at&sort=desc&per_page=${MAX_OPEN_REQUESTS}`,
        z.array(mergeRequestShape),
      )) ?? [],
  );
  for (const listed of opened.slice(0, MAX_OPEN_REQUESTS)) {
    if (input.expired()) {
      partial.value = true;
      break;
    }
    const entry = await within(undefined, () =>
      openRequestEntry(ctx, listed.iid),
    );
    if (entry !== undefined) {
      openRequests.push(entry.output);
      nextStep += entry.blocked;
    }
  }

  const addresses = addressesOf(input.system, input.addressLinkType);
  const environments = new Map<string, LastDeployOut>();
  for (const entry of deploys) {
    if (
      entry.environment !== undefined &&
      !environments.has(entry.environment)
    ) {
      environments.set(entry.environment, lastDeployOf(entry));
    }
  }
  const latestWebUrl = latest && shownLink(ctx.projectWebUrl, latest.web_url);

  return {
    app: input.app,
    ...(input.system.metadata.description
      ? { description: input.system.metadata.description }
      : {}),
    repository: { webUrl: input.projectWebUrl, defaultBranch: branch },
    ...(input.portalUrl !== undefined ? { portalUrl: input.portalUrl } : {}),
    pieces: input.pieces.map(piece => ({
      entityRef: piece.entityRef,
      ...(piece.title ? { title: piece.title } : {}),
      ...(piece.templateVersion
        ? { templateVersion: piece.templateVersion }
        : {}),
      ...(piece.dashboardUrl ? { dashboardUrl: piece.dashboardUrl } : {}),
    })),
    environments: [...environments].map(([name, lastDeploy]) => ({
      name,
      addresses,
      lastDeploy,
    })),
    ...(latest !== undefined
      ? {
          latestMain: {
            commit: latest.sha,
            status: latest.status,
            ...(latestWebUrl !== undefined ? { webUrl: latestWebUrl } : {}),
            ...(mainFail !== undefined
              ? { failedJobs: mainFail.failedJobs }
              : {}),
          },
        }
      : {}),
    openRequests,
    state,
    ...(partial.value || olderThanWindow ? { partial: true } : {}),
    nextStep: partial.value ? `${S.SENTENCE.partial} ${nextStep}` : nextStep,
  };
}

/** One open request for the sheet, and the blocked sentence it adds to the next step. */
async function openRequestEntry(
  ctx: FailureContext,
  iid: number,
): Promise<
  { output: StatusOutput['openRequests'][number]; blocked: string } | undefined
> {
  const mr = await ctx.gitlab.json(`/merge_requests/${iid}`, mergeRequestShape);
  if (mr === undefined) {
    return undefined;
  }
  const request = mergeRequestOut(ctx.projectWebUrl, mr);
  const head = mr.head_pipeline?.sha === mr.sha ? mr.head_pipeline : undefined;
  let failedJobs: FailedJob[] | undefined;
  let blocked = '';
  if (head?.status === 'failed') {
    const described = await describeFailedJobs(
      ctx,
      await pipelineJobs(ctx, head.id),
      requestFailure(ctx, mr.iid),
    );
    failedJobs = described.failedJobs;
    const detail =
      described.sentences.length > 0
        ? described.sentences.join(' ')
        : S.REQUEST_PIPELINE_FAILED_NO_JOB(
            linkText(ctx.projectWebUrl, head.web_url),
          );
    blocked = ` ${S.BLOCKED_MR(mr.iid, detail)}`;
  }
  const webUrl = shownLink(ctx.projectWebUrl, mr.web_url);
  return {
    output: {
      iid: mr.iid,
      title: mr.title ?? '',
      ...(webUrl !== undefined ? { webUrl } : {}),
      headCommit: mr.sha,
      pipelineStatus: head?.status ?? 'unknown',
      autoMerge: request.autoMerge,
      mergeStatus: request.mergeStatus,
      ...(failedJobs !== undefined ? { failedJobs } : {}),
    },
    blocked,
  };
}

interface DeployRead {
  entries: DeployEntry[];
  /** True when the window of recent default-branch pipelines was read in full. */
  windowFull: boolean;
}

/**
 * The deploys of the default branch, newest first, read from its own pipelines,
 * so an app with many request pipelines since its last deploy still finds it.
 * Superseded files are skipped. The newest `MAX_DEPLOY_PIPELINES` default-branch
 * pipelines are the only ones read, so an older deploy is not shown. `onPartial`
 * is called when the time budget ends before the list is read.
 */
async function recentDeploys(
  ctx: FailureContext,
  input: SheetInput,
  onPartial: () => void,
): Promise<DeployRead> {
  const pipelines =
    (await ctx.gitlab.json(
      `/pipelines?ref=${encodeURIComponent(
        ctx.defaultBranch,
      )}&order_by=id&sort=desc&per_page=${MAX_DEPLOY_PIPELINES}`,
      z.array(pipelineShape),
    )) ?? [];
  const entries: DeployEntry[] = [];
  for (const pipeline of pipelines) {
    if (entries.length >= MAX_DEPLOY_JOBS) {
      break;
    }
    if (input.expired()) {
      onPartial();
      break;
    }
    const jobs = await pipelineJobs(ctx, pipeline.id);
    const deployJob = newest(
      jobs.filter(job => job.name === ctx.settings.deployJobName),
    );
    if (
      deployJob === undefined ||
      (deployJob.status !== 'success' && deployJob.status !== 'failed')
    ) {
      continue;
    }
    const step = await readDeployStep(ctx, deployJob, pipeline);
    if (step.kind === 'superseded') {
      continue;
    }
    entries.push({
      environment: step.deploy.environment,
      step,
      pipelineUrl: `${input.projectWebUrl}/-/pipelines/${pipeline.id}`,
      jobUrl: shownLink(ctx.projectWebUrl, deployJob.web_url),
      ...(deployJob.finished_at ? { finishedAt: deployJob.finished_at } : {}),
    });
  }
  return { entries, windowFull: pipelines.length >= MAX_DEPLOY_PIPELINES };
}

function newest(jobs: readonly JobShape[]): JobShape | undefined {
  return [...jobs].sort((a, b) => b.id - a.id)[0];
}

function lastDeployOf(entry: DeployEntry): LastDeployOut {
  const deploy = entry.step.deploy;
  return {
    commit: deploy.commit,
    ...(entry.finishedAt !== undefined ? { finishedAt: entry.finishedAt } : {}),
    pipelineUrl: entry.pipelineUrl,
    ...(entry.jobUrl !== undefined ? { jobUrl: entry.jobUrl } : {}),
    result: deploy.result,
    code: deploy.code,
    ...(deploy.chart !== undefined ? { chart: deploy.chart } : {}),
    pieces: deploy.pieces,
  };
}

/** The failure of the default-branch pipeline: its deploy job when that failed, else its failed jobs. */
async function mainFailure(
  ctx: FailureContext,
  latest: PipelineShape,
  jobs: readonly JobShape[],
): Promise<Failure> {
  const deployJob = newest(
    jobs.filter(job => job.name === ctx.settings.deployJobName),
  );
  if (deployJob !== undefined && deployJob.status === 'failed') {
    const step = await readDeployStep(ctx, deployJob, { sha: latest.sha });
    if (step.kind === 'failed') {
      return { failedJobs: step.failedJobs, sentence: step.sentence };
    }
  }
  const described = await describeFailedJobs(ctx, jobs);
  return {
    failedJobs: described.failedJobs,
    sentence:
      described.sentences.length > 0
        ? described.sentences.join(' ')
        : S.DEFAULT_PIPELINE_FAILED_NO_JOB(
            linkText(ctx.projectWebUrl, latest.web_url),
          ),
  };
}
