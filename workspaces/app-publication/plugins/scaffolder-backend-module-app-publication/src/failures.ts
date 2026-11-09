import type { AppPublicationSettings } from './config';
import type { GitlabClient } from './gitlab';
import type { JobShape } from './gitlabShapes';
import { linkText, shownLink } from './links';
import * as S from './sentences';
import type { DeployOut, FailedJob, PieceOut } from './types';
import {
  CONTRACT_CODES,
  CONTRACT_RESULT,
  type SmokePiece,
  type SmokeResult,
  SMOKE_RESULT,
  ownedPathsInDiff,
  parseFile,
  smokeIsConsistent,
} from './resultFiles';

export const MAX_FAILED = 5;
const LOG_READ_BYTES = 262144;
const LOG_LINE_LIMIT = 500;
const REASON_PATTERN = /^[a-z_]{1,64}$/;
const LABEL_PATTERN = /^[A-Za-z0-9._:/ -]{1,255}$/;
const STAGE_ORDER = ['lint', 'build', 'scan', 'deploy'];
const FIXED_REASONS = ['script_failure', 'job_execution_timeout'];

export interface FailureContext {
  gitlab: GitlabClient;
  settings: AppPublicationSettings;
  defaultBranch: string;
  /** The project's own web address, the prefix every link the module shows must start with. */
  projectWebUrl: string;
  pieces: ReadonlySet<string>;
}

/** The request whose pipeline failed: its number, and its GitLab diff, read once when first needed. */
export interface RequestFailure {
  iid: number;
  diffPaths(): Promise<ReadonlySet<string>>;
}

interface Described {
  job: FailedJob;
  sentence: string;
}

export function safeLabel(value: string): string {
  return LABEL_PATTERN.test(value) ? value : '(name not shown)';
}

function stageRank(stage: string): number {
  const index = STAGE_ORDER.indexOf(stage);
  return index === -1 ? STAGE_ORDER.length : index;
}

/**
 * The failed jobs of one pipeline, at most five, in stage order, each with the
 * sentence that says what to do. The deploy job is left to readDeployStep.
 */
export async function describeFailedJobs(
  ctx: FailureContext,
  jobs: readonly JobShape[],
  request?: RequestFailure,
): Promise<{ failedJobs: FailedJob[]; sentences: string[] }> {
  const failed = jobs
    .filter(
      job =>
        job.status === 'failed' &&
        job.allow_failure !== true &&
        job.name !== ctx.settings.deployJobName,
    )
    .sort(
      (a, b) =>
        stageRank(a.stage) - stageRank(b.stage) || a.name.localeCompare(b.name),
    )
    .slice(0, MAX_FAILED);
  const described: Described[] = [];
  for (const job of failed) {
    described.push(await describeJob(ctx, job, request));
  }
  return {
    failedJobs: described.map(entry => entry.job),
    sentences: described.map(entry => entry.sentence),
  };
}

function baseEntry(ctx: FailureContext, job: JobShape): FailedJob {
  const reason = job.failure_reason ?? undefined;
  const webUrl = shownLink(ctx.projectWebUrl, job.web_url);
  return {
    name: safeLabel(job.name),
    stage: safeLabel(job.stage),
    ...(webUrl !== undefined ? { webUrl } : {}),
    ...(reason !== undefined && REASON_PATTERN.test(reason)
      ? { failureReason: reason }
      : {}),
  };
}

async function describeJob(
  ctx: FailureContext,
  job: JobShape,
  request: RequestFailure | undefined,
): Promise<Described> {
  const entry = baseEntry(ctx, job);
  const name = entry.name;
  const link = linkText(ctx.projectWebUrl, job.web_url);
  const reason = job.failure_reason ?? undefined;

  if (reason !== undefined && !FIXED_REASONS.includes(reason)) {
    if (REASON_PATTERN.test(reason)) {
      return {
        job: entry,
        sentence: S.REASON_OUTSIDE(name, reason, link),
      };
    }
    return explain(ctx, job, entry, S.EXPLAIN_FROM_LOG(name, link));
  }
  if (job.name === ctx.settings.conflictMarkersJobName) {
    return { job: entry, sentence: S.SENTENCE.conflictMarkers };
  }
  if (reason === 'job_execution_timeout') {
    return { job: entry, sentence: S.TIMEOUT(name, link) };
  }
  if (job.name === ctx.settings.contractJobName && request !== undefined) {
    const contract = await describeContract(ctx, job, request, entry);
    if (contract !== undefined) {
      return contract;
    }
    return explain(ctx, job, entry, S.EXPLAIN_FROM_LOG(name, link));
  }
  if (job.stage === 'lint' || job.stage === 'build') {
    return { job: entry, sentence: S.LINT_OR_BUILD(name) };
  }
  if (job.stage === 'scan') {
    return explain(ctx, job, entry, S.SCAN_FAILED(name, link));
  }
  return explain(ctx, job, entry, S.EXPLAIN_FROM_LOG(name, link));
}

async function describeContract(
  ctx: FailureContext,
  job: JobShape,
  request: RequestFailure,
  entry: FailedJob,
): Promise<Described | undefined> {
  const text = await ctx.gitlab.artifact(
    job.id,
    ctx.settings.contractResultArtifact,
    ctx.settings.maxArtifactBytes,
  );
  const file = parseFile(text, CONTRACT_RESULT);
  if (file === undefined || file.job !== job.name) {
    return undefined;
  }
  if (!(CONTRACT_CODES as readonly string[]).includes(file.code)) {
    return undefined;
  }
  const link = linkText(ctx.projectWebUrl, job.web_url);
  if (file.code === 'owned_file_changed') {
    const { safe, untrusted } = ownedPathsInDiff(
      file.paths,
      await request.diffPaths(),
    );
    if (safe.length === 0 && untrusted.length === 0) {
      return undefined;
    }
    return {
      job: {
        ...entry,
        code: 'owned_file_changed',
        ...(safe.length > 0 ? { paths: safe } : {}),
        ...(untrusted.length > 0 ? { untrustedPaths: untrusted } : {}),
      },
      sentence: ownedFileSentence(ctx, safe, untrusted.length, link),
    };
  }
  if (file.code === 'unreadable_path') {
    return {
      job: { ...entry, code: 'unreadable_path' },
      sentence: S.SENTENCE.contractUnreadable,
    };
  }
  return {
    job: { ...entry, code: 'checker_missing' },
    sentence: S.CONTRACT_CHECKER_MISSING(link),
  };
}

/** The restore sentence for the safe paths, and the note for any path that does not fit the safe form. */
function ownedFileSentence(
  ctx: FailureContext,
  safe: readonly string[],
  untrustedCount: number,
  link: string,
): string {
  if (safe.length === 0) {
    return S.CONTRACT_OWNED_ONLY_WITHHELD(untrustedCount, link);
  }
  const restore = S.CONTRACT_OWNED(
    safe.map(path => `\`${path}\``).join(', '),
    ctx.defaultBranch,
  );
  if (untrustedCount === 0) {
    return restore;
  }
  return `${restore} ${S.CONTRACT_OWNED_WITHHELD(untrustedCount, link)}`;
}

/**
 * The job's own name, stage and link, plus the end of its output for a failure
 * with no fixed explanation. The output is returned as untrusted data in its own
 * field and never put in a sentence.
 */
async function explain(
  ctx: FailureContext,
  job: JobShape,
  entry: FailedJob,
  sentence: string,
): Promise<Described> {
  const tail = await ctx.gitlab.textTail(
    `/jobs/${job.id}/trace`,
    LOG_READ_BYTES,
  );
  const lines = logLines(tail, ctx.settings.failedJobLogLines);
  return {
    job: { ...entry, untrustedJobOutput: lines },
    sentence,
  };
}

function logLines(
  tail: { text: string; truncated: boolean } | undefined,
  count: number,
): string[] {
  if (tail === undefined) {
    return [];
  }
  const lines = tail.text.split(/\r?\n/);
  if (tail.truncated) {
    lines.shift();
  }
  while (lines.length > 0 && lines[lines.length - 1]?.trim() === '') {
    lines.pop();
  }
  return lines.slice(-count).map(line => line.slice(0, LOG_LINE_LIMIT));
}

export type DeployStep =
  | { kind: 'published'; commit: string; deploy: DeployOut }
  | { kind: 'superseded' }
  | {
      kind: 'failed';
      commit: string;
      deploy: DeployOut;
      failedJobs: FailedJob[];
      sentence: string;
    };

/**
 * Reads the deploy job of one default-branch pipeline. Its smoke file is used
 * only when it passes every check against this job and this commit; otherwise
 * the failure is "no detail", with the end of the log.
 */
export async function readDeployStep(
  ctx: FailureContext,
  job: JobShape,
  pipeline: { sha: string },
): Promise<DeployStep> {
  const link = linkText(ctx.projectWebUrl, job.web_url);
  const text = await ctx.gitlab.artifact(
    job.id,
    ctx.settings.deployResultArtifact,
    ctx.settings.maxArtifactBytes,
  );
  const parsed = parseFile(text, SMOKE_RESULT);
  const file =
    parsed !== undefined &&
    smokeIsConsistent(parsed, {
      job: job.name,
      commit: pipeline.sha,
      pieces: ctx.pieces,
    })
      ? parsed
      : undefined;

  if (file?.code === 'superseded') {
    return { kind: 'superseded' };
  }
  if (job.status === 'success' && file?.code === 'ok') {
    return {
      kind: 'published',
      commit: pipeline.sha,
      deploy: deployOf(file, pipeline.sha),
    };
  }
  if (job.status === 'failed' && file !== undefined && file.code !== 'ok') {
    const sentence = deploySentence(file, link);
    if (sentence !== undefined) {
      return {
        kind: 'failed',
        commit: pipeline.sha,
        deploy: deployOf(file, pipeline.sha),
        failedJobs: [baseEntry(ctx, job)],
        sentence,
      };
    }
  }
  return noDetailStep(ctx, job, pipeline);
}

/** A failed deploy with no readable result: the end of its log, and the job's link for the platform team. */
export async function noDetailStep(
  ctx: FailureContext,
  job: JobShape,
  pipeline: { sha: string },
): Promise<Extract<DeployStep, { kind: 'failed' }>> {
  const explained = await explain(
    ctx,
    job,
    baseEntry(ctx, job),
    S.DEPLOY_NO_DETAIL(linkText(ctx.projectWebUrl, job.web_url)),
  );
  return {
    kind: 'failed',
    commit: pipeline.sha,
    deploy: noDetailDeploy(pipeline.sha),
    failedJobs: [explained.job],
    sentence: explained.sentence,
  };
}

function deploySentence(file: SmokeResult, link: string): string | undefined {
  const pieceWith = (code: SmokePiece['code']) =>
    file.pieces.find(piece => piece.code === code);
  switch (file.code) {
    case 'validate_failed': {
      const piece = pieceWith('validate_failed');
      return piece && S.VALIDATE_FAILED(piece.piece, file.environment);
    }
    case 'install_failed': {
      const piece = pieceWith('install_failed');
      return piece && S.INSTALL_FAILED(piece.piece);
    }
    case 'path_failed': {
      const piece = pieceWith('path_failed');
      const check = piece?.checks.find(candidate => !candidate.ok);
      return (
        piece &&
        check &&
        S.PATH_FAILED(
          piece.piece,
          check.path,
          check.status === null ? 'no answer' : String(check.status),
          String(check.attempts),
        )
      );
    }
    case 'not_run': {
      const piece = pieceWith('not_run');
      return piece && S.NOT_RUN(piece.piece, link);
    }
    case 'platform_failed':
      return S.PLATFORM_FAILED(link);
    default:
      return undefined;
  }
}

function toPieceOut(piece: SmokePiece): PieceOut {
  return {
    piece: piece.piece,
    result: piece.result,
    code: piece.code,
    checks: piece.checks.map(check => ({
      target: check.target,
      path: check.path,
      status: check.status,
      ok: check.ok,
      attempts: check.attempts,
    })),
  };
}

function deployOf(file: SmokeResult, commit: string): DeployOut {
  return {
    commit,
    environment: file.environment,
    result: file.result,
    code: file.code,
    ...(file.chart
      ? { chart: { version: file.chart.version, digest: file.chart.digest } }
      : {}),
    pieces: file.pieces.map(toPieceOut),
  };
}

function noDetailDeploy(commit: string): DeployOut {
  return { commit, result: 'failed', code: 'no_detail', pieces: [] };
}
