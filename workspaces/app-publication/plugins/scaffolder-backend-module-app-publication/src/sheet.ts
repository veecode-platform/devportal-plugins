import type { Entity } from '@backstage/catalog-model';
import { z } from 'zod/v3';
import type { AppPiece } from './app';
import {
  describeFailedJobs,
  type DeployStep,
  type FailureContext,
  readDeployStep,
} from './failures';
import {
  type JobShape,
  jobShape,
  mergeRequestShape,
  type PipelineShape,
  pipelineShape,
} from './gitlabShapes';
import {
  mergeRequestOut,
  pipelineJobs,
  RUNNING_STATES,
  requestFailure,
} from './publication';
import * as S from './sentences';
import type { FailedJob, LastDeployOut, StatusOutput } from './types';

const MAX_DEPLOY_JOBS = 5;
const MAX_OPEN_REQUESTS = 5;

export interface SheetInput {
  app: string;
  system: Entity;
  pieces: AppPiece[];
  projectWebUrl: string;
  portalUrl?: string;
  addressLinkType: string;
}

type Finished = Exclude<DeployStep, { kind: 'superseded' }>;

interface DeployEntry {
  /** The environment the file names; undefined when the file is missing or invalid. */
  environment?: string;
  step: Finished;
  pipelineUrl: string;
  jobUrl: string;
  finishedAt?: string;
}

/**
 * The app's sheet: its pieces, the last deploy of each environment, the newest
 * default-branch pipeline and the open requests. It waits for nothing.
 */
export async function readSheet(
  ctx: FailureContext,
  input: SheetInput,
): Promise<StatusOutput> {
  const branch = ctx.defaultBranch;
  const latest = (
    await ctx.gitlab.json(
      `/pipelines?ref=${encodeURIComponent(
        branch,
      )}&order_by=id&sort=desc&per_page=1`,
      z.array(pipelineShape),
    )
  )?.[0];

  const mainFail =
    latest?.status === 'failed'
      ? await mainFailure(ctx, latest, await pipelineJobs(ctx, latest.id))
      : undefined;
  const deploys = await recentDeploys(ctx, input);
  const live = deploys.find(entry => entry.step.kind === 'published');
  const last = deploys[0];
  const liveSentence = live ? ` ${S.LIVE_VERSION(live.step.commit)}` : '';

  let state: StatusOutput['state'];
  let nextStep: string;
  if (input.pieces.length === 0) {
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
    nextStep = S.SENTENCE.notPublished;
  }

  const openRequests: StatusOutput['openRequests'] = [];
  const opened =
    (await ctx.gitlab.json(
      `/merge_requests?state=opened&order_by=created_at&sort=desc&per_page=${MAX_OPEN_REQUESTS}`,
      z.array(mergeRequestShape),
    )) ?? [];
  for (const listed of opened.slice(0, MAX_OPEN_REQUESTS)) {
    const mr = await ctx.gitlab.json(
      `/merge_requests/${listed.iid}`,
      mergeRequestShape,
    );
    if (mr === undefined) {
      continue;
    }
    const request = mergeRequestOut(mr);
    const head =
      mr.head_pipeline?.sha === mr.sha ? mr.head_pipeline : undefined;
    let failedJobs: FailedJob[] | undefined;
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
          : S.REQUEST_PIPELINE_FAILED_NO_JOB(head.web_url);
      nextStep += ` ${S.BLOCKED_MR(mr.iid, detail)}`;
    }
    openRequests.push({
      iid: mr.iid,
      title: mr.title ?? '',
      webUrl: mr.web_url,
      headCommit: mr.sha,
      pipelineStatus: head?.status ?? 'unknown',
      autoMerge: request.autoMerge,
      mergeStatus: request.mergeStatus,
      ...(failedJobs !== undefined ? { failedJobs } : {}),
    });
  }

  const addresses = (input.system.metadata.links ?? [])
    .filter(link => link.type === input.addressLinkType)
    .map(link => ({
      url: link.url,
      ...(link.title ? { title: link.title } : {}),
    }));
  const environments = new Map<string, LastDeployOut>();
  for (const entry of deploys) {
    if (
      entry.environment !== undefined &&
      !environments.has(entry.environment)
    ) {
      environments.set(entry.environment, lastDeployOf(entry));
    }
  }

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
            webUrl: latest.web_url,
            ...(mainFail !== undefined
              ? { failedJobs: mainFail.failedJobs }
              : {}),
          },
        }
      : {}),
    openRequests,
    state,
    nextStep,
  };
}

/** Up to five recent deploy jobs of the default branch, newest first, without superseded ones. */
async function recentDeploys(
  ctx: FailureContext,
  input: SheetInput,
): Promise<DeployEntry[]> {
  const jobs =
    (await ctx.gitlab.json(
      `/jobs?scope[]=success&scope[]=failed&per_page=100`,
      z.array(jobShape),
    )) ?? [];
  const deployJobs = jobs
    .filter(
      job =>
        job.name === ctx.settings.deployJobName &&
        job.ref === ctx.defaultBranch,
    )
    .sort((a, b) => b.id - a.id)
    .slice(0, MAX_DEPLOY_JOBS);
  const entries: DeployEntry[] = [];
  for (const job of deployJobs) {
    const pipelineId = job.pipeline?.id;
    const sha = job.pipeline?.sha;
    if (pipelineId === undefined || sha === undefined) {
      continue;
    }
    const step = await readDeployStep(ctx, job, { sha });
    if (step.kind === 'superseded') {
      continue;
    }
    entries.push({
      environment: step.deploy.environment,
      step,
      pipelineUrl: `${input.projectWebUrl}/-/pipelines/${pipelineId}`,
      jobUrl: job.web_url,
      ...(job.finished_at ? { finishedAt: job.finished_at } : {}),
    });
  }
  return entries;
}

function lastDeployOf(entry: DeployEntry): LastDeployOut {
  const deploy = entry.step.deploy;
  return {
    commit: deploy.commit,
    ...(entry.finishedAt !== undefined ? { finishedAt: entry.finishedAt } : {}),
    pipelineUrl: entry.pipelineUrl,
    jobUrl: entry.jobUrl,
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
): Promise<{ failedJobs: FailedJob[]; sentence: string }> {
  const deployJob = jobs
    .filter(job => job.name === ctx.settings.deployJobName)
    .sort((a, b) => b.id - a.id)[0];
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
        : S.DEFAULT_PIPELINE_FAILED_NO_JOB(latest.web_url),
  };
}
