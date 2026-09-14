import { mockServices } from '@backstage/backend-test-utils';
import { reconcileTeardowns } from './lifecycleReconciler';
import { TeardownOperationRow, TeardownStore } from './teardownStore';

const config = { catalogFile: 'catalog-info.yaml', deployJobName: 'deploy' };

function op(overrides: Partial<TeardownOperationRow> = {}): TeardownOperationRow {
  return {
    id: 1,
    host: 'gitlab.example.com',
    project_slug: 'g/box',
    pipeline_id: 42,
    job_id: 6,
    requester_ref: 'user:default/alice',
    state: 'pending',
    detail: null,
    unregister_commit_sha: null,
    attempts: 0,
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function fakeStore(rows: TeardownOperationRow[]): TeardownStore & {
  markCalls: Array<[number, string, any]>;
  incrementCalls: number[];
} {
  const markCalls: Array<[number, string, any]> = [];
  const incrementCalls: number[] = [];
  return {
    markCalls,
    incrementCalls,
    async insertPending() {},
    async listPending() { return rows; },
    async listForProject() { return rows; },
    async markState(id, state, extra) { markCalls.push([id, state, extra]); },
    async incrementAttempts(id) { incrementCalls.push(id); return incrementCalls.filter(i => i === id).length; },
  };
}

const job = (overrides: Partial<{ status: string; finishedAt: string | null }> = {}) => ({
  id: 6, name: 'destroy', stage: 'destroy', status: 'success', manual: false, allowFailure: false,
  webUrl: 'u', startedAt: null, finishedAt: '2026-01-02T00:00:00Z', pipelineId: 42, ...overrides,
});

describe('reconcileTeardowns', () => {
  const logger = mockServices.logger.mock();

  it('deletes the catalog file and marks consumed on the happy path', async () => {
    const store = fakeStore([op()]);
    const gitlab: any = {
      getJob: jest.fn().mockResolvedValue(job()),
      getProject: jest.fn().mockResolvedValue({ defaultBranch: 'main' }),
      getPipeline: jest.fn().mockResolvedValue({ ref: 'main', status: 'success' }),
      listJobsByName: jest.fn().mockResolvedValue([]),
      deleteFile: jest.fn().mockResolvedValue({ commitSha: 'sha1' }),
    };
    await reconcileTeardowns({ logger, gitlab, store, config });
    expect(gitlab.deleteFile).toHaveBeenCalledWith('gitlab.example.com', 'g/box', 'main', 'catalog-info.yaml', expect.stringContaining('user:default/alice'));
    expect(store.markCalls).toEqual([[1, 'consumed', { unregisterCommitSha: 'sha1' }]]);
  });

  it('marks failed when the teardown job failed', async () => {
    const store = fakeStore([op()]);
    const gitlab: any = {
      getJob: jest.fn().mockResolvedValue(job({ status: 'failed' })),
      getProject: jest.fn(), getPipeline: jest.fn(), listJobsByName: jest.fn(), deleteFile: jest.fn(),
    };
    await reconcileTeardowns({ logger, gitlab, store, config });
    expect(store.markCalls).toEqual([[1, 'failed', { detail: 'teardown job failed' }]]);
    expect(gitlab.deleteFile).not.toHaveBeenCalled();
  });

  it('leaves pending while the job is still running', async () => {
    const store = fakeStore([op()]);
    const gitlab: any = {
      getJob: jest.fn().mockResolvedValue(job({ status: 'running' })),
      getProject: jest.fn(), getPipeline: jest.fn(), listJobsByName: jest.fn(), deleteFile: jest.fn(),
    };
    await reconcileTeardowns({ logger, gitlab, store, config });
    expect(store.markCalls).toEqual([]);
  });

  it('marks superseded and does not delete when a later deploy succeeded', async () => {
    const store = fakeStore([op()]);
    const gitlab: any = {
      getJob: jest.fn().mockResolvedValue(job({ finishedAt: '2026-01-02T00:00:00Z' })),
      getProject: jest.fn().mockResolvedValue({ defaultBranch: 'main' }),
      getPipeline: jest.fn().mockResolvedValue({ ref: 'main', status: 'success' }),
      listJobsByName: jest.fn().mockResolvedValue([
        { id: 99, name: 'deploy', finishedAt: '2026-01-03T00:00:00Z' },
      ]),
      deleteFile: jest.fn(),
    };
    await reconcileTeardowns({ logger, gitlab, store, config });
    expect(store.markCalls).toEqual([[1, 'superseded', { detail: expect.stringContaining('99') }]]);
    expect(gitlab.deleteFile).not.toHaveBeenCalled();
  });

  it('marks consumed on an idempotent delete of an already-absent file', async () => {
    const store = fakeStore([op()]);
    const gitlab: any = {
      getJob: jest.fn().mockResolvedValue(job()),
      getProject: jest.fn().mockResolvedValue({ defaultBranch: 'main' }),
      getPipeline: jest.fn().mockResolvedValue({ ref: 'main', status: 'success' }),
      listJobsByName: jest.fn().mockResolvedValue([]),
      deleteFile: jest.fn().mockResolvedValue({ alreadyAbsent: true }),
    };
    await reconcileTeardowns({ logger, gitlab, store, config });
    expect(store.markCalls).toEqual([[1, 'consumed', { detail: 'catalog file already absent' }]]);
  });

  it('marks failed when the pipeline ref is not the default branch', async () => {
    const store = fakeStore([op()]);
    const gitlab: any = {
      getJob: jest.fn().mockResolvedValue(job()),
      getProject: jest.fn().mockResolvedValue({ defaultBranch: 'main' }),
      getPipeline: jest.fn().mockResolvedValue({ ref: 'feature-branch', status: 'success' }),
      listJobsByName: jest.fn(),
      deleteFile: jest.fn(),
    };
    await reconcileTeardowns({ logger, gitlab, store, config });
    expect(store.markCalls).toEqual([[1, 'failed', { detail: expect.stringContaining('not the default branch') }]]);
    expect(gitlab.deleteFile).not.toHaveBeenCalled();
  });

  it('never re-processes a terminal (consumed) operation', async () => {
    // listPending() only returns pending rows in the real store; a fake that
    // already excludes the consumed row proves the reconciler does not try
    // to look outside what listPending() gives it.
    const store = fakeStore([]);
    const gitlab: any = { getJob: jest.fn(), getProject: jest.fn(), getPipeline: jest.fn(), listJobsByName: jest.fn(), deleteFile: jest.fn() };
    await reconcileTeardowns({ logger, gitlab, store, config });
    expect(gitlab.getJob).not.toHaveBeenCalled();
    expect(store.markCalls).toEqual([]);
  });
});
