import {
  ConflictError,
  InputError,
  NotAllowedError,
  NotFoundError,
  ServiceUnavailableError,
} from '@backstage/errors';
import { z } from 'zod/v3';
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
const PROJECT_PATH_PATTERN = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)+$/;
const MERGE_REQUEST_SEPARATOR = '/-/merge_requests/';
const IID_PATTERN = /^[1-9][0-9]*$/;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const STATUS_WORD_PATTERN = /^[a-z_]{1,64}$/;

export interface AutoMergeRequest {
  mergeRequestUrl: string;
  sourceBranch: string;
  targetBranch: string;
  removeSourceBranch: boolean;
}

export interface AutoMergeResult {
  headSha: string;
  status: 'armed' | 'merged';
}

export interface AutoMergeDependencies {
  gitlabIntegrations: GitlabIntegrations;
  fetch: FetchFunction;
  clock: Clock;
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

const mergeReplyShape = z
  .object({
    state: z.string().optional(),
    merge_when_pipeline_succeeds: z.boolean().optional(),
  })
  .passthrough();

type MergeRequestBody = z.infer<typeof requestShape>;

/**
 * Sets GitLab's auto-merge on the merge request a run opened. Every check runs
 * before the merge call, so a request that fails one is never armed. The head
 * commit is pinned: if it moved, GitLab answers 409 and nothing is set.
 */
export async function armAutoMerge(
  deps: AutoMergeDependencies,
  request: AutoMergeRequest,
): Promise<AutoMergeResult> {
  const target = parseMergeRequestUrl(request.mergeRequestUrl);
  const integration = deps.gitlabIntegrations.byHost(target.host);
  const token = integration?.config.token;
  if (integration === undefined || !token) {
    throw new NotAllowedError(
      `The portal has no GitLab integration with a token for ${target.host}, so it cannot arm this merge request. Tell the platform team.`,
    );
  }
  const apiBase = integration.config.apiBaseUrl;
  const requestUrl = `${apiBase}/projects/${encodeURIComponent(
    target.slug,
  )}/merge_requests/${target.iid}`;

  const userId = await readUserId(deps, apiBase, token);
  let body = await readRequest(deps, token, requestUrl);
  refuseUnlessOwnRequest(body, userId, request);
  const headSha = body.sha;

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
        'The merge request changed after the run opened it, so GitLab did not set auto-merge. Nothing was merged.',
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
    refuseUnlessOwnRequest(body, userId, request);
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

/** The host, project path and request number of a GitLab merge request address. */
export function parseMergeRequestUrl(mergeRequestUrl: string): {
  host: string;
  slug: string;
  iid: number;
} {
  const refusal = new InputError(
    'mergeRequestUrl must be a GitLab merge request address, for example https://gitlab.example.com/group/project/-/merge_requests/7',
  );
  let url: URL;
  try {
    url = new URL(mergeRequestUrl);
  } catch {
    throw refusal;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw refusal;
  }
  const separator = url.pathname.indexOf(MERGE_REQUEST_SEPARATOR);
  if (separator <= 0) {
    throw refusal;
  }
  const slug = url.pathname.slice(1, separator);
  const iid = url.pathname.slice(separator + MERGE_REQUEST_SEPARATOR.length);
  const segments = slug.split('/');
  if (
    !PROJECT_PATH_PATTERN.test(slug) ||
    segments.some(segment => segment === '.' || segment === '..') ||
    !IID_PATTERN.test(iid)
  ) {
    throw refusal;
  }
  return { host: url.host, slug, iid: Number(iid) };
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
    throw new NotAllowedError(
      "GitLab refused the portal's token for this merge request, so auto-merge was not set. Tell the platform team.",
    );
  }
  return readOk(response, requestShape);
}

/** Every check that decides whether this run may arm the request. */
function refuseUnlessOwnRequest(
  body: MergeRequestBody,
  userId: number,
  request: AutoMergeRequest,
): void {
  const refusal = (detail: string) =>
    new NotAllowedError(
      `${detail} The portal did not set auto-merge on it. Tell the platform team; do not change the code.`,
    );
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
  if (body.target_branch !== request.targetBranch) {
    throw refusal(`The merge request does not target ${request.targetBranch}.`);
  }
  if (body.source_project_id !== body.target_project_id) {
    throw refusal('The merge request comes from a fork of the project.');
  }
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
