import { NotFoundError, ServiceUnavailableError } from '@backstage/errors';
import { z } from 'zod/v3';

export type FetchFunction = (
  input: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<Response>;

export const MSG_NO_ACCESS =
  "The portal cannot read this app's GitLab project; tell the platform team.";
export const MSG_PROJECT_MISSING =
  'The GitLab project in the catalog was not found; tell the platform team.';
export const MSG_UNAVAILABLE = 'GitLab did not answer; call again in a minute.';

export interface GitlabConnection {
  apiBaseUrl: string;
  token?: string;
}

export interface GitlabClientOptions {
  connection: GitlabConnection;
  projectSlug: string;
  fetch: FetchFunction;
  /** Milliseconds a single request may still take; a request never outlives the call's deadline. */
  remainingMs(): number;
}

/**
 * Reads GitLab with the portal's token. Every response body is dropped on
 * error, and every error carries one of the fixed sentences above, so no
 * GitLab text reaches the caller.
 */
export class GitlabClient {
  private readonly base: string;

  constructor(private readonly options: GitlabClientOptions) {
    if (!options.connection.token) {
      throw new ServiceUnavailableError(MSG_NO_ACCESS);
    }
    this.base = `${options.connection.apiBaseUrl}/projects/${encodeURIComponent(
      options.projectSlug,
    )}`;
  }

  /**
   * One GET under the project. Returns the response for a 2xx or a 404 and lets
   * the caller decide what a 404 means; every other status is refused here.
   */
  async get(path: string): Promise<Response> {
    const timeout = Math.max(1, this.options.remainingMs());
    let response: Response;
    try {
      response = await this.options.fetch(`${this.base}${path}`, {
        headers: { 'PRIVATE-TOKEN': this.options.connection.token ?? '' },
        signal: AbortSignal.timeout(timeout),
      });
    } catch {
      throw new ServiceUnavailableError(MSG_UNAVAILABLE);
    }
    if (response.status === 401 || response.status === 403) {
      await discard(response);
      throw new ServiceUnavailableError(MSG_NO_ACCESS);
    }
    if (response.status >= 500) {
      await discard(response);
      throw new ServiceUnavailableError(MSG_UNAVAILABLE);
    }
    return response;
  }

  /** The project itself: a 404 here means the catalog names a project GitLab does not have. */
  async projectInfo<T>(schema: z.ZodType<T>): Promise<T> {
    const response = await this.get('');
    if (response.status === 404) {
      await discard(response);
      throw new NotFoundError(MSG_PROJECT_MISSING);
    }
    return parseBody(response, schema);
  }

  async json<T>(path: string, schema: z.ZodType<T>): Promise<T | undefined> {
    const response = await this.get(path);
    if (response.status === 404) {
      await discard(response);
      return undefined;
    }
    return parseBody(response, schema);
  }

  /** The last `maxBytes` of a job's log. `truncated` is true when its start was dropped. */
  async textTail(
    path: string,
    maxBytes: number,
  ): Promise<{ text: string; truncated: boolean } | undefined> {
    const response = await this.get(path);
    if (response.status === 404) {
      await discard(response);
      return undefined;
    }
    return unavailableIfReadFails(() => readTail(response, maxBytes));
  }

  /** One artifact file, as text, or undefined when it is missing, expired or larger than `maxBytes`. */
  async artifact(
    jobId: number,
    artifactPath: string,
    maxBytes: number,
  ): Promise<string | undefined> {
    const encoded = artifactPath.split('/').map(encodeURIComponent).join('/');
    const response = await this.get(`/jobs/${jobId}/artifacts/${encoded}`);
    if (response.status === 404) {
      await discard(response);
      return undefined;
    }
    return unavailableIfReadFails(() => readCapped(response, maxBytes));
  }
}

async function parseBody<T>(
  response: Response,
  schema: z.ZodType<T>,
): Promise<T> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ServiceUnavailableError(MSG_UNAVAILABLE);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ServiceUnavailableError(MSG_UNAVAILABLE);
  }
  return parsed.data;
}

async function unavailableIfReadFails<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch {
    throw new ServiceUnavailableError(MSG_UNAVAILABLE);
  }
}

async function discard(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined);
}

/** Reads the whole body if it fits, else undefined. Never holds more than `maxBytes` plus one chunk. */
async function readCapped(
  response: Response,
  maxBytes: number,
): Promise<string | undefined> {
  const declared = Number(response.headers.get('content-length') ?? '0');
  if (declared > maxBytes) {
    await discard(response);
    return undefined;
  }
  if (!response.body) {
    const text = await response.text();
    return Buffer.byteLength(text) > maxBytes ? undefined : text;
  }
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return undefined;
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** The last `maxBytes` of a body. `truncated` says whether the start was dropped. */
async function readTail(
  response: Response,
  maxBytes: number,
): Promise<{ text: string; truncated: boolean }> {
  if (!response.body) {
    const buffer = Buffer.from(await response.text());
    return buffer.length > maxBytes
      ? {
          text: buffer.subarray(buffer.length - maxBytes).toString('utf8'),
          truncated: true,
        }
      : { text: buffer.toString('utf8'), truncated: false };
  }
  const reader = response.body.getReader();
  const kept: Buffer[] = [];
  let size = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    const buffer = Buffer.from(value);
    kept.push(buffer);
    size += buffer.length;
    while (kept.length > 1 && size - (kept[0]?.length ?? 0) >= maxBytes) {
      size -= kept.shift()?.length ?? 0;
      truncated = true;
    }
  }
  let bytes = Buffer.concat(kept);
  if (bytes.length > maxBytes) {
    bytes = bytes.subarray(bytes.length - maxBytes);
    truncated = true;
  }
  return { text: bytes.toString('utf8'), truncated };
}
