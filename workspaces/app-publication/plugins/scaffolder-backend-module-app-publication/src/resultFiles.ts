import { z } from 'zod/v3';

/**
 * The two result files a job writes. Each is untrusted: it is read only from
 * the job that wrote it, and every field is validated before a value of it is
 * returned. A value that does not fit a closed list is refused, not copied.
 */

export const PIECE_RESULTS = ['passed', 'failed', 'not_attempted'] as const;
export const PIECE_CODES = [
  'ok',
  'validate_failed',
  'install_failed',
  'path_failed',
  'not_run',
] as const;
export const DEPLOY_RESULTS = ['passed', 'failed', 'skipped'] as const;
export const DEPLOY_FILE_CODES = [
  ...PIECE_CODES,
  'superseded',
  'platform_failed',
] as const;
export const CHECK_TARGETS = ['service'] as const;
export const CHECK_PATHS = ['/ready', '/health'] as const;
export const CONTRACT_CODES = [
  'owned_file_changed',
  'unreadable_path',
  'checker_missing',
] as const;

export const PIECE_PATTERN = /^[a-z][a-z0-9-]{0,30}$/;
const RELEASE_PATTERN = /^[a-z][a-z0-9-]{0,62}$/;
const ENVIRONMENT_PATTERN = /^[a-z][a-z0-9-]{0,30}$/;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const SEMVER_PATTERN =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
/** A path of at most 300 characters with no control character. Whether it is in the change is checked against GitLab. */
function isPlainPath(path: string): boolean {
  return (
    path.length >= 1 &&
    path.length <= 300 &&
    ![...path].some(character => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    })
  );
}

export const CHART_RESULT = z
  .object({
    version: z.string().regex(SEMVER_PATTERN),
    digest: z.string().regex(DIGEST_PATTERN),
  })
  .strict();

export const SMOKE_CHECK = z
  .object({
    target: z.enum(CHECK_TARGETS),
    path: z.enum(CHECK_PATHS),
    status: z.number().int().min(100).max(599).nullable(),
    ok: z.boolean(),
    attempts: z.number().int().min(0).max(100),
  })
  .strict();

export const SMOKE_PIECE = z
  .object({
    piece: z.string().regex(PIECE_PATTERN),
    release: z.string().regex(RELEASE_PATTERN).optional(),
    result: z.enum(PIECE_RESULTS),
    code: z.enum(PIECE_CODES),
    checks: z.array(SMOKE_CHECK).max(20),
  })
  .strict();

/** smoke-result.json, schema 2 only. Any other schema is refused by the literal below. */
export const SMOKE_RESULT = z
  .object({
    schema: z.literal(2),
    job: z.string().min(1).max(255),
    result: z.enum(DEPLOY_RESULTS),
    code: z.enum(DEPLOY_FILE_CODES),
    commit: z.string().regex(COMMIT_PATTERN),
    environment: z.string().regex(ENVIRONMENT_PATTERN),
    chart: CHART_RESULT.nullable().optional(),
    pieces: z.array(SMOKE_PIECE).max(50),
  })
  .strict();

/** contract-result.json, schema 1, written only by a failed contract check. */
export const CONTRACT_RESULT = z
  .object({
    schema: z.literal(1),
    job: z.string().min(1).max(255),
    result: z.literal('failed'),
    code: z.string().min(1).max(64),
    paths: z.array(z.string().max(300)).max(200),
    commits: z.array(z.string()).max(50),
    target: z.string().max(300).optional(),
  })
  .strict();

export type SmokeResult = z.infer<typeof SMOKE_RESULT>;
export type SmokePiece = z.infer<typeof SMOKE_PIECE>;

/** Returns the parsed file, or undefined when the text is not JSON or does not match the schema. */
export function parseFile<T>(
  text: string | undefined,
  schema: z.ZodType<T>,
): T | undefined {
  if (text === undefined) {
    return undefined;
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return undefined;
  }
  const parsed = schema.safeParse(body);
  return parsed.success ? parsed.data : undefined;
}

/**
 * The checks a deploy file must pass beyond its shape: the job and commit it
 * names are the ones GitLab shows, its pieces are Components of the app, and
 * its result agrees with its code.
 */
export function smokeIsConsistent(
  file: SmokeResult,
  expected: { job: string; commit: string; pieces: ReadonlySet<string> },
): boolean {
  if (file.job !== expected.job || file.commit !== expected.commit) {
    return false;
  }
  const names = file.pieces.map(piece => piece.piece);
  if (new Set(names).size !== names.length) {
    return false;
  }
  if (!names.every(name => expected.pieces.has(name))) {
    return false;
  }
  if (file.code === 'superseded') {
    return file.result === 'skipped' && file.pieces.length === 0;
  }
  if (file.code === 'ok') {
    return (
      file.result === 'passed' &&
      file.pieces.length > 0 &&
      file.pieces.every(piece => piece.code === 'ok')
    );
  }
  return file.result === 'failed';
}

/** A path the job reports is kept only when GitLab's own diff of the request holds it. */
export function ownedPathsInDiff(
  paths: readonly string[],
  diffPaths: ReadonlySet<string>,
): string[] {
  return paths.filter(
    path =>
      isPlainPath(path) &&
      !path.startsWith('/') &&
      !path.split('/').includes('..') &&
      diffPaths.has(path),
  );
}
