import type { BackstageCredentials } from '@backstage/backend-plugin-api';
import {
  ConflictError,
  InputError,
  NotAllowedError,
  NotFoundError,
} from '@backstage/errors';
import {
  API_BASE,
  COMMIT,
  DEFAULT_BRANCH,
  FakeGitlab,
  OTHER,
  PROJECT_WEB_URL,
  USER_PATH,
  fakeClock,
  json,
  paths,
  status,
} from '../fixtures';
import { createMergeRequestAutoMergeAction } from './mergeRequestAutoMerge';

const API_HOST = 'gitlab.example.com';
const MR_URL = `${PROJECT_WEB_URL}/-/merge_requests/7`;
const SOURCE_BRANCH = 'example-change';
const TOKEN_USER_ID = 42;
const USER_CREDENTIALS = {
  principal: { type: 'user', userEntityRef: 'user:default/example.user' },
} as unknown as BackstageCredentials;

const mergeRequest = (overrides: Record<string, unknown> = {}) => ({
  iid: 7,
  state: 'opened',
  sha: COMMIT,
  source_branch: SOURCE_BRANCH,
  target_branch: DEFAULT_BRANCH,
  source_project_id: 1,
  target_project_id: 1,
  author: { id: TOKEN_USER_ID },
  detailed_merge_status: 'mergeable',
  web_url: MR_URL,
  ...overrides,
});

const requestPath = paths.request(7);
const mergePath = (sha = COMMIT, removeSource = true) =>
  `/merge_requests/7/merge?auto_merge=true&sha=${sha}&should_remove_source_branch=${removeSource}`;

function harness() {
  const gitlab = new FakeGitlab();
  const clock = fakeClock();
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  const output = jest.fn();
  const action = createMergeRequestAutoMergeAction({
    gitlabIntegrations: {
      byHost: (host: string) =>
        host === API_HOST
          ? { config: { apiBaseUrl: API_BASE, token: 'example-token' } }
          : undefined,
    },
    fetch: gitlab.fetch,
    clock,
    auth: {
      isPrincipal: (credentials: BackstageCredentials, type: string) =>
        (credentials.principal as { type: string }).type === type,
    } as never,
  });
  const run = (
    input: Record<string, unknown> = {},
    credentials: BackstageCredentials = USER_CREDENTIALS,
  ) =>
    action.handler({
      input: {
        mergeRequestUrl: MR_URL,
        sourceBranch: SOURCE_BRANCH,
        targetBranch: DEFAULT_BRANCH,
        removeSourceBranch: true,
        ...input,
      },
      logger,
      output,
      getInitiatorCredentials: async () => credentials,
    } as never);
  return { action, gitlab, clock, logger, output, run };
}

const puts = (gitlab: FakeGitlab) =>
  gitlab.calls.filter(call => call.method === 'PUT');

describe('gitlab:merge-request:auto-merge', () => {
  it('has the id the template calls it by, and declares its inputs with defaults', () => {
    const { action } = harness();

    expect(action.id).toBe('gitlab:merge-request:auto-merge');
    expect(action.schema?.input).toMatchObject({
      properties: {
        targetBranch: { default: DEFAULT_BRANCH },
        removeSourceBranch: { default: true },
      },
    });
  });

  it('arms auto-merge on the request, pinned to its head commit, and reports armed', async () => {
    const w = harness();
    w.gitlab.reply(USER_PATH, json({ id: TOKEN_USER_ID }));
    w.gitlab.reply(requestPath, json(mergeRequest()));
    w.gitlab.reply(
      mergePath(),
      json({
        state: 'opened',
        merge_when_pipeline_succeeds: true,
        sha: COMMIT,
      }),
    );

    await w.run();

    expect(w.output).toHaveBeenCalledWith('mergeRequestUrl', MR_URL);
    expect(w.output).toHaveBeenCalledWith('headSha', COMMIT);
    expect(w.output).toHaveBeenCalledWith('status', 'armed');
    expect(puts(w.gitlab).map(call => call.path)).toEqual([mergePath()]);
    expect(JSON.stringify(w.logger.info.mock.calls)).not.toContain(
      'example-token',
    );
  });

  it('reports merged when GitLab merges the request at once', async () => {
    const w = harness();
    w.gitlab.reply(USER_PATH, json({ id: TOKEN_USER_ID }));
    w.gitlab.reply(requestPath, json(mergeRequest()));
    w.gitlab.reply(
      mergePath(),
      json({
        state: 'merged',
        merge_when_pipeline_succeeds: false,
        sha: COMMIT,
      }),
    );

    await w.run();

    expect(w.output).toHaveBeenCalledWith('status', 'merged');
  });

  it('passes the remove-source-branch choice through', async () => {
    const w = harness();
    w.gitlab.reply(USER_PATH, json({ id: TOKEN_USER_ID }));
    w.gitlab.reply(requestPath, json(mergeRequest()));
    w.gitlab.reply(
      mergePath(COMMIT, false),
      json({
        state: 'opened',
        merge_when_pipeline_succeeds: true,
        sha: COMMIT,
      }),
    );

    await w.run({ removeSourceBranch: false });

    expect(puts(w.gitlab).map(call => call.path)).toEqual([
      mergePath(COMMIT, false),
    ]);
  });

  it('refuses a request the portal token did not open, and never sets auto-merge', async () => {
    const w = harness();
    w.gitlab.reply(USER_PATH, json({ id: TOKEN_USER_ID }));
    w.gitlab.reply(requestPath, json(mergeRequest({ author: { id: 99 } })));

    await expect(w.run()).rejects.toThrow(NotAllowedError);
    expect(puts(w.gitlab)).toEqual([]);
  });

  it('refuses a source branch other than the one the run pushed', async () => {
    const w = harness();
    w.gitlab.reply(USER_PATH, json({ id: TOKEN_USER_ID }));
    w.gitlab.reply(requestPath, json(mergeRequest()));

    await expect(w.run({ sourceBranch: 'other-change' })).rejects.toThrow(
      NotAllowedError,
    );
    expect(puts(w.gitlab)).toEqual([]);
  });

  it('refuses a target branch other than the one asked for', async () => {
    const w = harness();
    w.gitlab.reply(USER_PATH, json({ id: TOKEN_USER_ID }));
    w.gitlab.reply(requestPath, json(mergeRequest()));

    await expect(w.run({ targetBranch: 'release' })).rejects.toThrow(
      NotAllowedError,
    );
    expect(puts(w.gitlab)).toEqual([]);
  });

  it('refuses a closed request', async () => {
    const w = harness();
    w.gitlab.reply(USER_PATH, json({ id: TOKEN_USER_ID }));
    w.gitlab.reply(requestPath, json(mergeRequest({ state: 'closed' })));

    await expect(w.run()).rejects.toThrow(NotAllowedError);
    expect(puts(w.gitlab)).toEqual([]);
  });

  it('refuses a request from a fork of the project', async () => {
    const w = harness();
    w.gitlab.reply(USER_PATH, json({ id: TOKEN_USER_ID }));
    w.gitlab.reply(requestPath, json(mergeRequest({ source_project_id: 2 })));

    await expect(w.run()).rejects.toThrow(NotAllowedError);
    expect(puts(w.gitlab)).toEqual([]);
  });

  it('refuses a 409 and does not retry, since the head moved after the request was opened', async () => {
    const w = harness();
    w.gitlab.reply(USER_PATH, json({ id: TOKEN_USER_ID }));
    w.gitlab.reply(requestPath, json(mergeRequest()));
    w.gitlab.reply(mergePath(), status(409));

    await expect(w.run()).rejects.toThrow(ConflictError);
    expect(puts(w.gitlab)).toHaveLength(1);
    expect(w.output).not.toHaveBeenCalledWith('status', expect.anything());
  });

  it('retries a 405 while GitLab is still preparing the request, then arms it', async () => {
    const w = harness();
    w.gitlab.reply(USER_PATH, json({ id: TOKEN_USER_ID }));
    w.gitlab.reply(
      requestPath,
      json(mergeRequest({ detailed_merge_status: 'preparing' })),
      json(mergeRequest({ detailed_merge_status: 'checking' })),
    );
    w.gitlab.reply(
      mergePath(),
      status(405),
      json({
        state: 'opened',
        merge_when_pipeline_succeeds: true,
        sha: COMMIT,
      }),
    );

    await w.run();

    expect(puts(w.gitlab)).toHaveLength(2);
    expect(w.clock.elapsed()).toBe(3000);
    expect(w.output).toHaveBeenCalledWith('status', 'armed');
  });

  it('gives up on a 405 that stays after three retries', async () => {
    const w = harness();
    w.gitlab.reply(USER_PATH, json({ id: TOKEN_USER_ID }));
    w.gitlab.reply(
      requestPath,
      json(mergeRequest({ detailed_merge_status: 'preparing' })),
      json(mergeRequest({ detailed_merge_status: 'checking' })),
    );
    w.gitlab.reply(mergePath(), status(405));

    await expect(w.run()).rejects.toThrow(ConflictError);
    expect(puts(w.gitlab)).toHaveLength(4);
    expect(w.clock.elapsed()).toBe(9000);
    expect(w.output).not.toHaveBeenCalledWith('status', expect.anything());
  });

  it('does not retry a 405 when GitLab reports a merge conflict', async () => {
    const w = harness();
    w.gitlab.reply(USER_PATH, json({ id: TOKEN_USER_ID }));
    w.gitlab.reply(
      requestPath,
      json(mergeRequest()),
      json(mergeRequest({ detailed_merge_status: 'conflict' })),
    );
    w.gitlab.reply(mergePath(), status(405));

    await expect(w.run()).rejects.toThrow(ConflictError);
    expect(puts(w.gitlab)).toHaveLength(1);
    expect(w.clock.elapsed()).toBe(0);
  });

  it('refuses when the head moved while the request was being prepared', async () => {
    const w = harness();
    w.gitlab.reply(USER_PATH, json({ id: TOKEN_USER_ID }));
    w.gitlab.reply(
      requestPath,
      json(mergeRequest()),
      json(mergeRequest({ detailed_merge_status: 'checking', sha: OTHER })),
    );
    w.gitlab.reply(mergePath(), status(405));

    await expect(w.run()).rejects.toThrow(ConflictError);
    expect(puts(w.gitlab)).toHaveLength(1);
  });

  it('refuses a 200 that does not set auto-merge', async () => {
    const w = harness();
    w.gitlab.reply(USER_PATH, json({ id: TOKEN_USER_ID }));
    w.gitlab.reply(requestPath, json(mergeRequest()));
    w.gitlab.reply(
      mergePath(),
      json({
        state: 'opened',
        merge_when_pipeline_succeeds: false,
        sha: COMMIT,
      }),
    );

    await expect(w.run()).rejects.toThrow('did not set auto-merge');
  });

  it('refuses a 401 from the merge and names the target branch', async () => {
    const w = harness();
    w.gitlab.reply(USER_PATH, json({ id: TOKEN_USER_ID }));
    w.gitlab.reply(requestPath, json(mergeRequest()));
    w.gitlab.reply(mergePath(), status(401));

    const failure = await w.run().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(NotAllowedError);
    expect((failure as Error).message).toContain(DEFAULT_BRANCH);
  });

  it('refuses a merge request GitLab does not have', async () => {
    const w = harness();
    w.gitlab.reply(USER_PATH, json({ id: TOKEN_USER_ID }));

    await expect(w.run()).rejects.toThrow(NotFoundError);
    expect(puts(w.gitlab)).toEqual([]);
  });

  it('refuses a host with no GitLab integration, before any request', async () => {
    const w = harness();

    await expect(
      w.run({
        mergeRequestUrl:
          'https://other.example.com/example-org/example-app/-/merge_requests/7',
      }),
    ).rejects.toThrow(NotAllowedError);
    expect(w.gitlab.calls).toEqual([]);
  });

  it('refuses a link that is not a merge request address, before any request', async () => {
    const w = harness();

    await expect(
      w.run({ mergeRequestUrl: `${PROJECT_WEB_URL}` }),
    ).rejects.toThrow(InputError);
    expect(w.gitlab.calls).toEqual([]);
  });

  it('refuses a caller that is not a user, before any request', async () => {
    const w = harness();
    const service = {
      principal: { type: 'service' },
    } as unknown as BackstageCredentials;

    await expect(w.run({}, service)).rejects.toThrow(NotAllowedError);
    expect(w.gitlab.calls).toEqual([]);
  });
});
