import { mockServices } from '@backstage/backend-test-utils';
import express from 'express';
import request from 'supertest';
import { AuthorizedContext } from './auth/authorize';
import { createRouter } from './router';
import { TeardownStore, NewTeardownOperation, TeardownOperationRow } from './service/teardownStore';

const ctx: AuthorizedContext = {
  entityRef: 'resource:default/box',
  host: 'gitlab.example.com',
  projectSlug: 'g/box',
  ownerRef: 'group:default/team-a',
  userEntityRef: 'user:default/alice',
};

function fakeStore(rows: TeardownOperationRow[] = []): TeardownStore & { inserted: NewTeardownOperation[] } {
  const inserted: NewTeardownOperation[] = [];
  return {
    inserted,
    async insertPending(op) { inserted.push(op); },
    async listPending() { return rows; },
    async listForProject() { return rows; },
    async markState() {},
    async incrementAttempts() { return 0; },
  };
}

function app(opts: {
  gitlab: any;
  teardownStore?: ReturnType<typeof fakeStore>;
  lifecycle?: { teardownJobName: string };
}) {
  const router = createRouter({
    logger: mockServices.logger.mock(),
    authorize: async () => ctx,
    gitlab: opts.gitlab,
    teardownStore: opts.teardownStore,
    lifecycle: opts.lifecycle,
  });
  return express().use(router);
}

const url = (p: string) => `/entities/default/resource/box${p}`;

describe('router teardown capture', () => {
  it('inserts a pending operation when the played job matches the teardown job name', async () => {
    const store = fakeStore();
    const gitlab = {
      getJob: jest.fn().mockResolvedValue({ id: 6, name: 'destroy', status: 'manual', manual: true, pipelineId: 99 }),
      playJob: jest.fn().mockResolvedValue({ id: 6, name: 'destroy', status: 'pending', manual: false, pipelineId: 99 }),
    };
    const res = await request(app({ gitlab, teardownStore: store, lifecycle: { teardownJobName: 'destroy' } }))
      .post(url('/jobs/6/play'))
      .send({ variables: [] });
    expect(res.status).toBe(200);
    expect(store.inserted).toEqual([
      { host: 'gitlab.example.com', projectSlug: 'g/box', pipelineId: 99, jobId: 6, requesterRef: 'user:default/alice' },
    ]);
  });

  it('does not insert when the played job does not match the teardown job name', async () => {
    const store = fakeStore();
    const gitlab = {
      getJob: jest.fn().mockResolvedValue({ id: 7, name: 'apply', status: 'manual', manual: true, pipelineId: 99 }),
      playJob: jest.fn().mockResolvedValue({ id: 7, name: 'apply', status: 'pending', manual: false, pipelineId: 99 }),
    };
    const res = await request(app({ gitlab, teardownStore: store, lifecycle: { teardownJobName: 'destroy' } }))
      .post(url('/jobs/7/play'))
      .send({ variables: [] });
    expect(res.status).toBe(200);
    expect(store.inserted).toEqual([]);
  });

  it('does not insert when the lifecycle feature is disabled', async () => {
    const gitlab = {
      getJob: jest.fn().mockResolvedValue({ id: 6, name: 'destroy', status: 'manual', manual: true, pipelineId: 99 }),
      playJob: jest.fn().mockResolvedValue({ id: 6, name: 'destroy', status: 'pending', manual: false, pipelineId: 99 }),
    };
    const res = await request(app({ gitlab })).post(url('/jobs/6/play')).send({ variables: [] });
    expect(res.status).toBe(200);
  });

  it('does not fail the play response when the store insert throws', async () => {
    const store = fakeStore();
    store.insertPending = async () => { throw new Error('db unavailable'); };
    const gitlab = {
      getJob: jest.fn().mockResolvedValue({ id: 6, name: 'destroy', status: 'manual', manual: true, pipelineId: 99 }),
      playJob: jest.fn().mockResolvedValue({ id: 6, name: 'destroy', status: 'pending', manual: false, pipelineId: 99 }),
    };
    const res = await request(app({ gitlab, teardownStore: store, lifecycle: { teardownJobName: 'destroy' } }))
      .post(url('/jobs/6/play'))
      .send({ variables: [] });
    expect(res.status).toBe(200);
  });

  it('lists recorded teardown operations for the entity project', async () => {
    const row: TeardownOperationRow = {
      id: 1,
      host: 'gitlab.example.com',
      project_slug: 'g/box',
      pipeline_id: 99,
      job_id: 6,
      requester_ref: 'user:default/alice',
      state: 'pending',
      detail: null,
      unregister_commit_sha: null,
      attempts: 0,
      created_at: new Date('2026-01-01T00:00:00Z'),
      updated_at: new Date('2026-01-01T00:00:00Z'),
    };
    const store = fakeStore([row]);
    const res = await request(app({ gitlab: {}, teardownStore: store })).get(url('/teardowns'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        id: 1,
        host: 'gitlab.example.com',
        projectSlug: 'g/box',
        pipelineId: 99,
        jobId: 6,
        requesterRef: 'user:default/alice',
        state: 'pending',
        detail: null,
        unregisterCommitSha: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
  });

  it('returns an empty list when the lifecycle feature is disabled', async () => {
    const res = await request(app({ gitlab: {} })).get(url('/teardowns'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
