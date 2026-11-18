import { ServiceUnavailableError } from '@backstage/errors';
import type { AppPublicationSettings } from './config';
import type { GitlabClient } from './gitlab';
import { type JobShape, compareShape } from './gitlabShapes';
import { linkText, shownLink } from './links';
import * as S from './sentences';
import type { DeployOut, FailedJob, PieceOut } from './types';
import {
  COMMIT_PATTERN,
  CONTRACT_RESULT,
  type ContractResult,
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
/** A job or stage name that may appear in a sentence: a closed label of plain characters. */
const LABEL_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const STAGE_ORDER = ['lint', 'build', 'scan', 'deploy'];
const FIXED_REASONS = ['script_failure', 'job_execution_timeout'];
/** A line the render check prints for a config the platform chart refused, and nothing else on the line. */
const REFUSED_LINE = /^refused (\S+) (\S+)$/;
/** The prefix the runner puts in front of each trace line: an RFC 3339 time, a two-digit hex index, O or E, then a space or +. */
const RUNNER_PREFIX =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z [0-9A-Fa-f]{2}[OE][ +]/;
/** An ANSI escape sequence, such as a colour or an erase-line code. */
// eslint-disable-next-line no-control-regex -- matching the escape character is the point of this pattern
const ANSI_SEQUENCE = /\u001b\[[0-?]*[ -/]*[@-~]/g;
/** A section marker line the runner prints around a step. It has no text for the reader. */
const SECTION_MARKER = /^section_(?:start|end):\S*$/;
const EMAIL_ADDRESS =
  /[\p{L}\p{N}._%+-]{1,64}@(?:[\p{L}\p{N}-]{1,63}\.)+\p{L}{2,63}/gu;
const EMAIL_PLACEHOLDER = '[email]';

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

/**
 * The pipeline whose failure is described. A merge request's pipeline has the
 * request's diff; the default branch's pipeline has the commit it ran on.
 */
export type FailedPipeline =
  | { readonly kind: 'merge_request'; readonly request: RequestFailure }
  | { readonly kind: 'default_branch'; readonly commit: string };

interface Described {
  job: FailedJob;
  sentence: string;
}

/**
 * A name a sentence may show, or a placeholder with the raw name kept in an
 * untrusted field. The raw name is data written by the job's author.
 */
function labelOf(
  value: string,
  configured: readonly string[] = [],
): { shown: string; untrusted?: string } {
  return LABEL_PATTERN.test(value) || configured.includes(value)
    ? { shown: value }
    : { shown: '(name not shown)', untrusted: value };
}

function configuredJobNames(settings: AppPublicationSettings): string[] {
  return [
    settings.deployJobName,
    settings.contractJobName,
    settings.conflictMarkersJobName,
    settings.renderJobName,
    ...settings.knownJobNames,
  ];
}

/** The secret scan: a job of the scan stage, or the scanner job by its name. */
function isScanJob(job: JobShape): boolean {
  return job.stage === 'scan' || job.name === 'secrets:gitleaks';
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
  route: S.Route,
  pipeline: FailedPipeline,
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
    described.push(await describeJob(ctx, job, route, pipeline));
  }
  return {
    failedJobs: described.map(entry => entry.job),
    sentences: described.map(entry => entry.sentence),
  };
}

/** The job's name, stage, link and failure reason, without any output. */
export function jobEntry(ctx: FailureContext, job: JobShape): FailedJob {
  return baseEntry(ctx, job);
}

function baseEntry(ctx: FailureContext, job: JobShape): FailedJob {
  const reason = job.failure_reason ?? undefined;
  const webUrl = shownLink(ctx.projectWebUrl, job.web_url);
  const name = labelOf(job.name, configuredJobNames(ctx.settings));
  const stage = labelOf(job.stage);
  return {
    name: name.shown,
    stage: stage.shown,
    ...(name.untrusted !== undefined
      ? { untrustedJobName: name.untrusted }
      : {}),
    ...(stage.untrusted !== undefined
      ? { untrustedStage: stage.untrusted }
      : {}),
    ...(webUrl !== undefined ? { webUrl } : {}),
    ...(reason !== undefined && REASON_PATTERN.test(reason)
      ? { failureReason: reason }
      : {}),
  };
}

async function describeJob(
  ctx: FailureContext,
  job: JobShape,
  route: S.Route,
  pipeline: FailedPipeline,
): Promise<Described> {
  const entry = baseEntry(ctx, job);
  const name = entry.name;
  const link = linkText(ctx.projectWebUrl, job.web_url);
  const reason = job.failure_reason ?? undefined;

  if (reason !== undefined && !FIXED_REASONS.includes(reason)) {
    if (REASON_PATTERN.test(reason)) {
      // A scan is never retried by a direct push: the next push would skip the commits this one left unscanned.
      if (route.kind === 'direct_push' && isScanJob(job)) {
        return {
          job: entry,
          sentence: S.SCAN_REASON_OUTSIDE_DIRECT(name, reason, link),
        };
      }
      return {
        job: entry,
        sentence: S.REASON_OUTSIDE(name, reason, link, route),
      };
    }
    return explain(ctx, job, entry, S.EXPLAIN_FROM_LOG(name, link));
  }
  if (job.name === ctx.settings.conflictMarkersJobName) {
    return explain(ctx, job, entry, S.CONFLICT_MARKERS(route));
  }
  if (reason === 'job_execution_timeout') {
    return { job: entry, sentence: S.TIMEOUT(name, link) };
  }
  if (job.name === ctx.settings.contractJobName) {
    const contract = await describeContract(ctx, job, pipeline, entry);
    if (contract !== undefined) {
      return contract;
    }
    return explain(ctx, job, entry, S.EXPLAIN_FROM_LOG(name, link));
  }
  if (job.name === ctx.settings.renderJobName) {
    return describeRender(ctx, job, entry, name, link, route);
  }
  if (job.stage === 'lint' || job.stage === 'build') {
    return explain(ctx, job, entry, S.LINT_OR_BUILD(name, route));
  }
  if (job.stage === 'scan') {
    return explain(
      ctx,
      job,
      entry,
      pipeline.kind === 'merge_request'
        ? S.SCAN_FAILED(name, link)
        : S.SCAN_FAILED_ON_DEFAULT_BRANCH(name, link, route),
    );
  }
  return explain(ctx, job, entry, S.EXPLAIN_FROM_LOG(name, link));
}

async function describeContract(
  ctx: FailureContext,
  job: JobShape,
  pipeline: FailedPipeline,
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
  const link = linkText(ctx.projectWebUrl, job.web_url);
  switch (file.code) {
    case 'owned_file_changed':
      return ownedFilesFailure(ctx, file, pipeline, entry, link);
    case 'no_platform_base':
      // A merge request keeps the log explanation it has always had.
      return pipeline.kind === 'default_branch'
        ? {
            job: { ...entry, code: 'no_platform_base' },
            sentence: S.CONTRACT_NO_PLATFORM_BASE(link),
          }
        : undefined;
    case 'unreadable_path':
      return {
        job: { ...entry, code: 'unreadable_path' },
        sentence: S.SENTENCE.contractUnreadable,
      };
    case 'checker_missing':
      return {
        job: { ...entry, code: 'checker_missing' },
        sentence: S.CONTRACT_CHECKER_MISSING(link),
      };
    default:
      return undefined;
  }
}

/**
 * The owned paths a contract job names, kept only when the change holds them. A
 * merge request's change is its diff. A default-branch change is what its commit
 * added since the platform commit the check named, so that name is checked
 * before GitLab is asked for anything.
 */
async function ownedFilesFailure(
  ctx: FailureContext,
  file: ContractResult,
  pipeline: FailedPipeline,
  entry: FailedJob,
  link: string,
): Promise<Described | undefined> {
  if (pipeline.kind === 'merge_request') {
    const { safe, untrusted } = ownedPathsInDiff(
      file.paths,
      await pipeline.request.diffPaths(),
    );
    return ownedFilesDescribed(entry, safe, untrusted, link, list =>
      S.CONTRACT_OWNED(list, ctx.defaultBranch),
    );
  }
  const target = file.target;
  if (target === undefined || !COMMIT_PATTERN.test(target)) {
    return undefined;
  }
  const { safe, untrusted } = ownedPathsInDiff(
    file.paths,
    await comparedPaths(ctx, target, pipeline.commit),
  );
  return ownedFilesDescribed(entry, safe, untrusted, link, list =>
    S.CONTRACT_OWNED_FROM_TARGET(list, target, ctx.defaultBranch),
  );
}

/** The job's entry and sentence for its owned paths, or undefined when the change holds none of them. */
function ownedFilesDescribed(
  entry: FailedJob,
  safe: string[],
  untrusted: string[],
  link: string,
  restore: (list: string) => string,
): Described | undefined {
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
    sentence: ownedFileSentence(safe, untrusted.length, link, restore),
  };
}

/**
 * The paths that a compare of two commits changes, new and old, as a set. A compare
 * GitLab does not answer holds none, so no path is kept.
 */
async function comparedPaths(
  ctx: FailureContext,
  from: string,
  to: string,
): Promise<ReadonlySet<string>> {
  const range = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const compare = await ctx.gitlab.json(
    `/repository/compare?${range}`,
    compareShape,
  );
  return changedPaths(compare?.diffs ?? []);
}

/** The new and the old path of each diff, as a set. */
export function changedPaths(
  diffs: readonly { new_path?: string; old_path?: string }[],
): Set<string> {
  const paths = new Set<string>();
  for (const diff of diffs) {
    if (diff.new_path) paths.add(diff.new_path);
    if (diff.old_path) paths.add(diff.old_path);
  }
  return paths;
}

/** The restore sentence for the safe paths, and the note for any path that does not fit the safe form. */
function ownedFileSentence(
  safe: readonly string[],
  untrustedCount: number,
  link: string,
  restore: (list: string) => string,
): string {
  if (safe.length === 0) {
    return S.CONTRACT_OWNED_ONLY_WITHHELD(untrustedCount, link);
  }
  const sentence = restore(safe.map(path => `\`${path}\``).join(', '));
  if (untrustedCount === 0) {
    return sentence;
  }
  return `${sentence} ${S.CONTRACT_OWNED_WITHHELD(untrustedCount, link)}`;
}

/**
 * The job's own name, stage and link, plus the end of its log for a failure whose
 * sentence points to the log. The log is returned as untrusted data in its own
 * field and never put in a sentence.
 */
async function explain(
  ctx: FailureContext,
  job: JobShape,
  entry: FailedJob,
  sentence: string,
): Promise<Described> {
  return withLog(ctx, entry, await jobLog(ctx, job), sentence);
}

function withLog(
  ctx: FailureContext,
  entry: FailedJob,
  log: string[] | undefined,
  sentence: string,
): Described {
  if (log === undefined) {
    return {
      job: entry,
      sentence: `${sentence} ${S.LOG_UNREADABLE(entry.name)}`,
    };
  }
  return {
    job: { ...entry, untrustedJobOutput: lastLines(ctx, log) },
    sentence,
  };
}

/**
 * The job's log as the reader sees it: every cleaned line of the window that was
 * read. Undefined, not empty, when GitLab could not give the log.
 */
async function jobLog(
  ctx: FailureContext,
  job: JobShape,
): Promise<string[] | undefined> {
  try {
    const tail = await ctx.gitlab.textTail(
      `/jobs/${job.id}/trace`,
      LOG_READ_BYTES,
    );
    return cleanLines(tail);
  } catch (error) {
    if (error instanceof ServiceUnavailableError) {
      return undefined;
    }
    throw error;
  }
}

/**
 * The render check, on a merge request or on the default branch. A refusal line
 * anywhere in the log read names a config of this app, and its file is named to
 * the user. Only the last lines are returned. With no such line, the job gets the
 * generic explanation.
 */
async function describeRender(
  ctx: FailureContext,
  job: JobShape,
  entry: FailedJob,
  name: string,
  link: string,
  route: S.Route,
): Promise<Described> {
  const log = await jobLog(ctx, job);
  const refusals = log === undefined ? [] : refusedConfigs(ctx, log);
  return withLog(
    ctx,
    entry,
    log,
    refusals.length > 0
      ? S.RENDER_REFUSED(refusals, link, route)
      : S.EXPLAIN_FROM_LOG(name, link),
  );
}

/**
 * The refusals in a cleaned log that name one of the app's pieces and one of its
 * configured environments, each pair once, in the order of the log. Any other
 * line is ignored, and no text of the line is kept.
 */
function refusedConfigs(
  ctx: FailureContext,
  lines: readonly string[],
): { piece: string; environment: string }[] {
  const refusals: { piece: string; environment: string }[] = [];
  for (const line of lines) {
    const match = REFUSED_LINE.exec(line.trim());
    const piece = match?.[1];
    const environment = match?.[2];
    if (piece === undefined || environment === undefined) {
      continue;
    }
    if (
      !ctx.pieces.has(piece) ||
      !ctx.settings.environments.includes(environment)
    ) {
      continue;
    }
    if (
      refusals.some(
        refusal =>
          refusal.piece === piece && refusal.environment === environment,
      )
    ) {
      continue;
    }
    refusals.push({ piece, environment });
  }
  return refusals;
}

/**
 * The lines of a trace window as the reader sees them. The window is split at
 * line feeds and carriage returns, and the runner's prefix and the escape
 * sequences are removed. E-mail addresses are replaced by a placeholder. Leading
 * spaces are kept. Empty lines and section markers are dropped, and a cut-off
 * first line is dropped too. A trace without the runner's prefix goes through
 * the same steps, minus the prefix.
 */
function cleanLines(
  tail: { text: string; truncated: boolean } | undefined,
): string[] {
  if (tail === undefined) {
    return [];
  }
  const raw = tail.text.split(/\r\n|\r|\n/);
  if (tail.truncated) {
    raw.shift();
  }
  return raw
    .map(cleanLine)
    .filter(line => line.trim() !== '' && !SECTION_MARKER.test(line.trim()))
    .map(line => line.slice(0, LOG_LINE_LIMIT));
}

/** One trace line without the runner's prefix and escape sequences, with e-mail addresses replaced, trailing spaces removed. */
function cleanLine(line: string): string {
  const text = line.replace(RUNNER_PREFIX, '').replace(ANSI_SEQUENCE, '');
  const redacted = text.includes('@')
    ? text.replace(EMAIL_ADDRESS, EMAIL_PLACEHOLDER)
    : text;
  return redacted.trimEnd();
}

/** The last `failedJobLogLines` cleaned lines of a log. */
function lastLines(ctx: FailureContext, lines: readonly string[]): string[] {
  return lines.slice(-ctx.settings.failedJobLogLines);
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
  route: () => Promise<S.Route>,
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
      environments: new Set(ctx.settings.environments),
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
    const sentence = await deploySentence(file, link, route);
    if (sentence !== undefined) {
      const explained = await explain(ctx, job, baseEntry(ctx, job), sentence);
      return {
        kind: 'failed',
        commit: pipeline.sha,
        deploy: deployOf(file, pipeline.sha),
        failedJobs: [explained.job],
        sentence: explained.sentence,
      };
    }
  }
  return noDetailStep(ctx, job, pipeline);
}

/**
 * A deploy with no readable result. A failed job also returns the end of its
 * output for the platform team; a job that succeeded, or did not run, returns
 * no output at all, because it did not fail.
 */
export async function noDetailStep(
  ctx: FailureContext,
  job: JobShape,
  pipeline: { sha: string },
): Promise<Extract<DeployStep, { kind: 'failed' }>> {
  const sentence = S.DEPLOY_NO_DETAIL(linkText(ctx.projectWebUrl, job.web_url));
  const deploy = noDetailDeploy(pipeline.sha);
  if (job.status !== 'failed') {
    return {
      kind: 'failed',
      commit: pipeline.sha,
      deploy,
      failedJobs: [baseEntry(ctx, job)],
      sentence,
    };
  }
  const explained = await explain(ctx, job, baseEntry(ctx, job), sentence);
  return {
    kind: 'failed',
    commit: pipeline.sha,
    deploy,
    failedJobs: [explained.job],
    sentence: explained.sentence,
  };
}

/**
 * The sentence for a failed deploy's result file. The route is awaited only for a
 * sentence that depends on it, so a failure that needs none costs no lookup.
 */
async function deploySentence(
  file: SmokeResult,
  link: string,
  route: () => Promise<S.Route>,
): Promise<string | undefined> {
  const pieceWith = (code: SmokePiece['code']) =>
    file.pieces.find(piece => piece.code === code);
  switch (file.code) {
    case 'validate_failed': {
      const piece = pieceWith('validate_failed');
      return (
        piece && S.VALIDATE_FAILED(piece.piece, file.environment, await route())
      );
    }
    case 'install_failed': {
      const piece = pieceWith('install_failed');
      return piece && S.INSTALL_FAILED(piece.piece, await route());
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
          await route(),
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
