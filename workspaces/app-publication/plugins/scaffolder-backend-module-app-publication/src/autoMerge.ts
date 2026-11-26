import {
  ConflictError,
  InputError,
  NotAllowedError,
  NotFoundError,
  ServiceUnavailableError,
} from '@backstage/errors';
import { z } from 'zod/v3';
import { type AutoMergeSettings, PROJECT_PATH_PATTERN } from './config';
import type { Clock, GitlabIntegrations } from './dependencies';
import { type FetchFunction, MSG_UNAVAILABLE } from './gitlab';

/** The states GitLab reports while it prepares a request, when a merge may still be refused with a 405. */
export const PREPARING_STATUSES: readonly string[] = [
  'preparing',
  'checking',
  'unchecked',
  'ci_still_running',
  'ci_must_pass',
];
export const MAX_PREPARING_RETRIES = 3;
export const PREPARING_RETRY_MILLISECONDS = 3000;

const REQUEST_TIMEOUT_MILLISECONDS = 30000;
const MERGE_REQUEST_SEPARATOR = '/-/merge_requests/';
const IID_PATTERN = /^[1-9][0-9]*$/;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const STATUS_WORD_PATTERN = /^[a-z_]{1,64}$/;
const MSG_TOKEN_REFUSED =
  "GitLab refused the portal's token for this merge request, so auto-merge was not set. Tell the platform team.";

/** A merge request address, as parsed: its scheme and host, the project path it writes, and the request number. */
export interface MergeRequestAddress {
  protocol: string;
  host: string;
  slug: string;
  iid: number;
}

export interface AutoMergeRequest {
  target: MergeRequestAddress;
  sourceBranch: string;
  targetBranch: string;
  removeSourceBranch: boolean;
  expectedHeadSha?: string;
}

export interface AutoMergeResult {
  headSha: string;
  status: 'armed' | 'merged';
}

export interface AutoMergeDependencies {
  gitlabIntegrations: GitlabIntegrations;
  fetch: FetchFunction;
  clock: Clock;
  autoMerge: AutoMergeSettings;
}

const userShape = z.object({ id: z.number().int() }).passthrough();

const requestShape = z
  .object({
    state: z.string(),
    sha: z.string().regex(COMMIT_PATTERN),
    source_branch: z.string(),
    target_branch: z.string(),
    source_project_id: z.number().int(),
    target_project_id: z.number().int(),
    author: z.object({ id: z.number().int() }).passthrough(),
    detailed_merge_status: z.string().optional(),
  })
  .passthrough();

const projectShape = z
  .object({ id: z.number().int(), path_with_namespace: z.string() })
  .passthrough();

const commitListShape = z.array(
  z.object({ id: z.string().regex(COMMIT_PATTERN) }).passthrough(),
);

const mergeReplyShape = z
  .object({
    state: z.string().optional(),
    merge_when_pipeline_succeeds: z.boolean().optional(),
  })
  .passthrough();

type MergeRequestBody = z.infer<typeof requestShape>;

/**
 * Sets GitLab's auto-merge on the merge request a run opened. Every check runs
 * before the merge call, so a request that fails one is never armed. The request
 * must sit in a listed project and hold exactly one commit, which is its head.
 * The head commit is pinned at the first read: if it moved after that, GitLab
 * answers 409 and nothing is set.
 */
export async function armAutoMerge(
  deps: AutoMergeDependencies,
  request: AutoMergeRequest,
): Promise<AutoMergeResult> {
  if (deps.autoMerge.allowedProjects.length === 0) {
    throw new NotAllowedError(
      'The portal has no project on its auto-merge list, so it does not set auto-merge on any merge request: appPublication.autoMerge.allowedProjects is missing or empty. Tell the platform team; do not change the code.',
    );
  }
  const { target } = request;
  const integration = deps.gitlabIntegrations.byHost(target.host);
  const token = integration?.config.token;
  if (integration === undefined || !token) {
    throw new NotAllowedError(
      `The portal has no GitLab integration with a token for ${target.host}, so it cannot arm this merge request. Tell the platform team.`,
    );
  }
  const apiBase = integration.config.apiBaseUrl;
  const projectUrl = `${apiBase}/projects/${encodeURIComponent(target.slug)}`;
  const requestUrl = `${projectUrl}/merge_requests/${target.iid}`;

  const userId = await readUserId(deps, apiBase, token);
  let body = await readRequest(deps, token, requestUrl);
  await refuseUnlistedProject(deps, token, projectUrl, body);
  refuseUnlessOwnRequest(body, userId, request, deps.autoMerge);
  const headSha = body.sha;
  if (
    request.expectedHeadSha !== undefined &&
    request.expectedHeadSha !== headSha
  ) {
    throw new ConflictError(
      'The merge request head is not the commit this run pushed, so auto-merge was not set. Nothing was merged.',
    );
  }
  await refuseUnlessOneCommit(deps, token, requestUrl, headSha);

  let retries = 0;
  for (;;) {
    const response = await send(
      deps,
      token,
      'PUT',
      `${requestUrl}/merge?${new URLSearchParams({
        auto_merge: 'true',
        sha: headSha,
        should_remove_source_branch: String(request.removeSourceBranch),
      })}`,
    );
    if (response.status === 200) {
      const reply = await readBody(response, mergeReplyShape);
      if (reply?.state === 'merged') {
        return { headSha, status: 'merged' };
      }
      if (reply?.merge_when_pipeline_succeeds === true) {
        return { headSha, status: 'armed' };
      }
      throw new ConflictError(
        'GitLab did not set auto-merge, so the merge request was not armed. Nothing was merged.',
      );
    }
    await discard(response);
    if (response.status === 409) {
      throw new ConflictError(
        'The merge request changed after the portal read it, so GitLab did not set auto-merge. Nothing was merged.',
      );
    }
    if (response.status === 401 || response.status === 403) {
      throw new NotAllowedError(
        `The portal's GitLab token cannot merge into ${request.targetBranch}, so auto-merge was not set. Tell the platform team.`,
      );
    }
    if (response.status !== 405) {
      throw new ConflictError(
        `GitLab refused to set auto-merge (HTTP ${response.status}). Nothing was merged.`,
      );
    }

    body = await readRequest(deps, token, requestUrl);
    refuseUnlessOwnRequest(body, userId, request, deps.autoMerge);
    if (body.sha !== headSha) {
      throw new ConflictError(
        'The merge request changed while GitLab prepared it, so auto-merge was not set. Nothing was merged.',
      );
    }
    const status = body.detailed_merge_status ?? '';
    if (!PREPARING_STATUSES.includes(status)) {
      throw new ConflictError(
        `GitLab cannot set auto-merge yet: the merge request is "${shownStatus(
          status,
        )}". Nothing was merged.`,
      );
    }
    if (retries === MAX_PREPARING_RETRIES) {
      throw new ConflictError(
        `GitLab kept the merge request "${shownStatus(
          status,
        )}" after ${MAX_PREPARING_RETRIES} retries, so auto-merge was not set. Nothing was merged.`,
      );
    }
    retries += 1;
    await deps.clock.sleep(PREPARING_RETRY_MILLISECONDS);
  }
}

/** The parsed address of a GitLab merge request, or an input error that names no part of it. */
export function parseMergeRequestUrl(
  mergeRequestUrl: string,
): MergeRequestAddress {
  const invalidAddress = new InputError(
    'mergeRequestUrl must be a GitLab merge request address of the form https://<host>/<group>/<project>/-/merge_requests/<number>, with no user name, query or fragment',
  );
  let url: URL;
  try {
    url = new URL(mergeRequestUrl);
  } catch {
    throw invalidAddress;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw invalidAddress;
  }
  // A user name, a query or a fragment can carry a secret. A bare ? or # leaves
  // url.search and url.hash empty, so the text is checked as well as the parts.
  if (
    url.username !== '' ||
    url.password !== '' ||
    mergeRequestUrl.includes('?') ||
    mergeRequestUrl.includes('#')
  ) {
    throw invalidAddress;
  }
  const separator = url.pathname.indexOf(MERGE_REQUEST_SEPARATOR);
  if (separator <= 0) {
    throw invalidAddress;
  }
  const slug = url.pathname.slice(1, separator);
  const iid = url.pathname.slice(separator + MERGE_REQUEST_SEPARATOR.length);
  const segments = slug.split('/');
  if (
    !PROJECT_PATH_PATTERN.test(slug) ||
    segments.some(segment => segment === '.' || segment === '..') ||
    !IID_PATTERN.test(iid)
  ) {
    throw invalidAddress;
  }
  return { protocol: url.protocol, host: url.host, slug, iid: Number(iid) };
}

/** The only form of the address the action logs or returns. */
export function canonicalMergeRequestUrl(target: MergeRequestAddress): string {
  return `${target.protocol}//${target.host}/${target.slug}/-/merge_requests/${target.iid}`;
}

async function readUserId(
  deps: AutoMergeDependencies,
  apiBase: string,
  token: string,
): Promise<number> {
  const response = await send(deps, token, 'GET', `${apiBase}/user`);
  if (response.status === 401 || response.status === 403) {
    await discard(response);
    throw new NotAllowedError(
      "GitLab refused the portal's token, so auto-merge was not set. Tell the platform team.",
    );
  }
  const body = await readOk(response, userShape);
  return body.id;
}

async function readRequest(
  deps: AutoMergeDependencies,
  token: string,
  requestUrl: string,
): Promise<MergeRequestBody> {
  const response = await send(deps, token, 'GET', requestUrl);
  if (response.status === 404) {
    await discard(response);
    throw new NotFoundError(
      'GitLab has no merge request at this address. Check the link from the publication step.',
    );
  }
  if (response.status === 401 || response.status === 403) {
    await discard(response);
    throw new NotAllowedError(MSG_TOKEN_REFUSED);
  }
  return readOk(response, requestShape);
}

async function refuseUnlistedProject(
  deps: AutoMergeDependencies,
  token: string,
  projectUrl: string,
  body: MergeRequestBody,
): Promise<void> {
  const project = await readGitlab(
    deps,
    token,
    projectUrl,
    projectShape,
    MSG_TOKEN_REFUSED,
  );
  if (
    project.id !== body.target_project_id ||
    !deps.autoMerge.allowedProjects.includes(project.path_with_namespace)
  ) {
    throw refusal(
      "The merge request's project is not on the portal's auto-merge list (appPublication.autoMerge.allowedProjects), or the portal could not confirm it.",
    );
  }
}

async function refuseUnlessOneCommit(
  deps: AutoMergeDependencies,
  token: string,
  requestUrl: string,
  headSha: string,
): Promise<void> {
  const commits = await readGitlab(
    deps,
    token,
    `${requestUrl}/commits`,
    commitListShape,
    MSG_TOKEN_REFUSED,
  );
  if (commits.length !== 1) {
    throw refusal('The merge request does not hold exactly one commit.');
  }
  if (commits[0].id !== headSha) {
    throw refusal("The merge request's only commit is not its head.");
  }
}

/** Every check that decides whether this run may arm the request. */
function refuseUnlessOwnRequest(
  body: MergeRequestBody,
  userId: number,
  request: AutoMergeRequest,
  settings: AutoMergeSettings,
): void {
  if (body.state !== 'opened') {
    throw refusal('The merge request is not open.');
  }
  if (body.author.id !== userId) {
    throw refusal(
      "The merge request was not opened by the portal's GitLab user.",
    );
  }
  if (body.source_branch !== request.sourceBranch) {
    throw refusal(
      "The merge request's source branch is not the branch this run pushed.",
    );
  }
  const prefixes = settings.sourceBranchPrefixes;
  if (
    prefixes !== undefined &&
    !prefixes.some(prefix => body.source_branch.startsWith(prefix))
  ) {
    throw refusal(
      "The merge request's source branch does not start with an allowed prefix (appPublication.autoMerge.sourceBranchPrefixes).",
    );
  }
  if (body.target_branch !== request.targetBranch) {
    throw refusal(`The merge request does not target ${request.targetBranch}.`);
  }
  if (body.source_project_id !== body.target_project_id) {
    throw refusal('The merge request comes from a fork of the project.');
  }
}

/** A refusal that says the portal did not set auto-merge, and names no GitLab text. */
function refusal(detail: string): NotAllowedError {
  return new NotAllowedError(
    `${detail} The portal did not set auto-merge on it. Tell the platform team; do not change the code.`,
  );
}

/** A GET of one GitLab address: the token's refusal names the request, and a non-2xx answer is unavailable. */
async function readGitlab<T>(
  deps: AutoMergeDependencies,
  token: string,
  url: string,
  schema: z.ZodType<T>,
  refused: string,
): Promise<T> {
  const response = await send(deps, token, 'GET', url);
  if (response.status === 401 || response.status === 403) {
    await discard(response);
    throw new NotAllowedError(refused);
  }
  return readOk(response, schema);
}

/** A GitLab status word, shown only when it has the shape of one. Anything else is "unknown". */
function shownStatus(status: string): string {
  return STATUS_WORD_PATTERN.test(status) ? status : 'unknown';
}

async function send(
  deps: AutoMergeDependencies,
  token: string,
  method: 'GET' | 'PUT',
  url: string,
): Promise<Response> {
  let response: Response;
  try {
    response = await deps.fetch(url, {
      method,
      headers: { 'PRIVATE-TOKEN': token },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS),
    });
  } catch {
    throw new ServiceUnavailableError(MSG_UNAVAILABLE);
  }
  if (response.status >= 500) {
    await discard(response);
    throw new ServiceUnavailableError(MSG_UNAVAILABLE);
  }
  return response;
}

async function readOk<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  if (!response.ok) {
    await discard(response);
    throw new ServiceUnavailableError(MSG_UNAVAILABLE);
  }
  const body = await readBody(response, schema);
  if (body === undefined) {
    throw new ServiceUnavailableError(MSG_UNAVAILABLE);
  }
  return body;
}

async function readBody<T>(
  response: Response,
  schema: z.ZodType<T>,
): Promise<T | undefined> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return undefined;
  }
  const parsed = schema.safeParse(body);
  return parsed.success ? parsed.data : undefined;
}

async function discard(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined);
}
