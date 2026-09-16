import { mockServices } from '@backstage/backend-test-utils';
import { reconcilePromotions } from './promotionFinalizer';
import { PromotionRecordRow, PromotionStore } from './promotionStore';
import type { AssociatedPluginsResponse } from '@veecode-platform/backstage-plugin-kong-service-manager-common';

const config = { applyTimeoutMinutes: 10 };
const repo = { host: 'gitlab.example.com', projectSlug: 'group/box', projectId: 42, iid: 7 };
const logger = mockServices.logger.mock();

function row(overrides: Partial<PromotionRecordRow> = {}): PromotionRecordRow {
  return {
    id: 1,
    idempotency_key: 'key-1',
    instance: 'default',
    service_name: 'svc',
    route_id: 'route-1',
    plugin_type: 'rate-limiting',
    config_snapshot: { minute: 60 },
    state: 'draft',
    mode: 'experiment',
    mr_ref: null,
    requester_ref: 'user:default/alice',
    detail: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function fakeStore(rows: PromotionRecordRow[]): PromotionStore & { transitionCalls: Array<[number, string, any]> } {
  const transitionCalls: Array<[number, string, any]> = [];
  return {
    transitionCalls,
    async upsertDraft() { throw new Error('not used in this test'); },
    async getById() { throw new Error('not used in this test'); },
    async getByIdempotencyKey() { throw new Error('not used in this test'); },
    async getActiveByRoute() { throw new Error('not used in this test'); },
    async listByRoute() { throw new Error('not used in this test'); },
    async listActive() { return rows; },
    async transition(id, state, extra) { transitionCalls.push([id, state, extra]); },
  };
}

function plugin(overrides: Partial<AssociatedPluginsResponse> = {}): AssociatedPluginsResponse {
  return {
    id: 'plugin-1',
    name: 'rate-limiting',
    enabled: true,
    config: { minute: 60 },
    protocols: ['http', 'https'],
    tags: [`promotion-pending:${repo.projectId}-${repo.iid}`],
    created_at: 1700000000,
    service: null,
    route: { id: 'route-1' },
    consumer: null,
    ...overrides,
  };
}

describe('reconcilePromotions', () => {
  it('never touches Kong or GitLab for a store with no active records (terminal states excluded)', async () => {
    const store = fakeStore([]);
    const gitlab: any = { getProject: jest.fn(), findOpenMergeRequest: jest.fn(), getMergeRequest: jest.fn(), hasSuccessfulDeployAtOrAfter: jest.fn() };
    const kong: any = { getRouteAssociatedPlugins: jest.fn(), removeRoutePlugin: jest.fn(), editRoutePlugin: jest.fn(), addPluginToRoute: jest.fn() };

    await reconcilePromotions({ logger, gitlab, kong, store, config });

    expect(gitlab.getProject).not.toHaveBeenCalled();
    expect(kong.getRouteAssociatedPlugins).not.toHaveBeenCalled();
    expect(store.transitionCalls).toEqual([]);
  });

  describe('draft (orphan probe, P3 handoff note 1)', () => {
    it('resumes to mr-open when GitLab already has an MR for the branch the record never recorded', async () => {
      const draft = row({ detail: JSON.stringify({ host: repo.host, projectSlug: repo.projectSlug, projectId: repo.projectId }) });
      const store = fakeStore([draft]);
      const gitlab: any = {
        getProject: jest.fn().mockResolvedValue({ archived: false, defaultBranch: 'main' }),
        findOpenMergeRequest: jest.fn().mockResolvedValue({
          projectId: repo.projectId,
          iid: repo.iid,
          webUrl: 'https://gitlab.example.com/group/box/-/merge_requests/7',
        }),
      };
      const kong: any = {};

      await reconcilePromotions({ logger, gitlab, kong, store, config });

      expect(gitlab.findOpenMergeRequest).toHaveBeenCalledWith(
        { host: repo.host, projectSlug: repo.projectSlug, projectId: repo.projectId },
        'kong-promote/rate-limiting',
      );
      expect(store.transitionCalls).toEqual([
        [1, 'mr-open', { mrRef: 'https://gitlab.example.com/group/box/-/merge_requests/7', detail: expect.any(String) }],
      ]);
      const [, , extra] = store.transitionCalls[0];
      expect(JSON.parse(extra.detail)).toEqual({ host: repo.host, projectSlug: repo.projectSlug, projectId: repo.projectId, iid: repo.iid });
    });

    it('leaves a genuinely still-drafting record untouched when no MR exists yet', async () => {
      const draft = row({ detail: JSON.stringify({ host: repo.host, projectSlug: repo.projectSlug, projectId: repo.projectId }) });
      const store = fakeStore([draft]);
      const gitlab: any = {
        getProject: jest.fn().mockResolvedValue({ archived: false, defaultBranch: 'main' }),
        findOpenMergeRequest: jest.fn().mockResolvedValue(undefined),
      };
      await reconcilePromotions({ logger, gitlab, kong: {} as any, store, config });
      expect(store.transitionCalls).toEqual([]);
    });

    it('leaves a draft with no repo coordinates alone (repo not resolved yet)', async () => {
      const draft = row({ detail: null });
      const store = fakeStore([draft]);
      const gitlab: any = { getProject: jest.fn(), findOpenMergeRequest: jest.fn() };
      await reconcilePromotions({ logger, gitlab, kong: {} as any, store, config });
      expect(gitlab.getProject).not.toHaveBeenCalled();
      expect(gitlab.findOpenMergeRequest).not.toHaveBeenCalled();
      expect(store.transitionCalls).toEqual([]);
    });
  });

  describe('mr-open', () => {
    const detail = JSON.stringify({ host: repo.host, projectSlug: repo.projectSlug, projectId: repo.projectId, iid: repo.iid });

    it('stays put while the MR is still opened', async () => {
      const record = row({ state: 'mr-open', mr_ref: 'mr-url', detail });
      const store = fakeStore([record]);
      const gitlab: any = {
        getProject: jest.fn().mockResolvedValue({ archived: false, defaultBranch: 'main' }),
        getMergeRequest: jest.fn().mockResolvedValue({ state: 'opened', mergedAt: null }),
      };
      await reconcilePromotions({ logger, gitlab, kong: {} as any, store, config });
      expect(store.transitionCalls).toEqual([]);
    });

    it('untags the experimental plugin and discards the record when the MR is closed unmerged', async () => {
      const record = row({ state: 'mr-open', mr_ref: 'mr-url', detail });
      const store = fakeStore([record]);
      const gitlab: any = {
        getProject: jest.fn().mockResolvedValue({ archived: false, defaultBranch: 'main' }),
        getMergeRequest: jest.fn().mockResolvedValue({ state: 'closed', mergedAt: null }),
      };
      const kong: any = {
        getRouteAssociatedPlugins: jest.fn().mockResolvedValue([plugin()]),
        editRoutePlugin: jest.fn().mockResolvedValue(undefined),
      };

      await reconcilePromotions({ logger, gitlab, kong, store, config });

      expect(kong.editRoutePlugin).toHaveBeenCalledWith('default', 'route-1', 'plugin-1', { tags: [] });
      expect(store.transitionCalls).toEqual([[1, 'discarded', undefined]]);
    });

    it('deletes the experimental plugin and parks in awaiting-deploy once the MR is merged (ADR-020)', async () => {
      const record = row({ state: 'mr-open', mr_ref: 'mr-url', detail });
      const store = fakeStore([record]);
      const gitlab: any = {
        getProject: jest.fn().mockResolvedValue({ archived: false, defaultBranch: 'main' }),
        getMergeRequest: jest.fn().mockResolvedValue({ state: 'merged', mergedAt: '2026-09-01T00:00:00Z' }),
      };
      const kong: any = {
        getRouteAssociatedPlugins: jest.fn().mockResolvedValue([plugin()]),
        removeRoutePlugin: jest.fn().mockResolvedValue(undefined),
      };

      await reconcilePromotions({ logger, gitlab, kong, store, config });

      expect(kong.removeRoutePlugin).toHaveBeenCalledWith('default', 'route-1', 'plugin-1');
      expect(store.transitionCalls).toHaveLength(1);
      const [id, state, extra] = store.transitionCalls[0];
      expect([id, state]).toEqual([1, 'awaiting-deploy']);
      const parsed = JSON.parse(extra.detail);
      expect(parsed).toMatchObject({ ...repo, mergedAt: '2026-09-01T00:00:00Z' });
      expect(typeof parsed.parkedSince).toBe('string');
      expect(typeof parsed.experimentRemovedAt).toBe('string');
    });

    it('parks anyway when the experimental plugin is already gone (crash between the delete and the transition)', async () => {
      const record = row({ state: 'mr-open', mr_ref: 'mr-url', detail });
      const store = fakeStore([record]);
      const gitlab: any = {
        getProject: jest.fn().mockResolvedValue({ archived: false, defaultBranch: 'main' }),
        getMergeRequest: jest.fn().mockResolvedValue({ state: 'merged', mergedAt: '2026-09-01T00:00:00Z' }),
      };
      const kong: any = {
        getRouteAssociatedPlugins: jest.fn().mockResolvedValue([]),
        removeRoutePlugin: jest.fn(),
      };

      await reconcilePromotions({ logger, gitlab, kong, store, config });

      expect(kong.removeRoutePlugin).not.toHaveBeenCalled();
      expect(store.transitionCalls).toHaveLength(1);
      expect(store.transitionCalls[0][1]).toBe('awaiting-deploy');
    });

    it('deadlock guard: the code-owned plugin can only be created after the merge deletes the experiment', async () => {
      const record = row({ state: 'mr-open', mr_ref: 'mr-url', detail });
      const store = fakeStore([record]);
      const gitlab: any = {
        getProject: jest.fn().mockResolvedValue({ archived: false, defaultBranch: 'main' }),
        getMergeRequest: jest.fn().mockResolvedValue({ state: 'merged', mergedAt: '2026-09-01T00:00:00Z' }),
      };

      // Models Kong's real one-instance-per-(type,route) constraint: the
      // controller's own plugin can only be created once the experimental
      // one is gone — which is why the delete happens at merge, before CI
      // deploys the chart (ADR-020).
      let experimentalDeleted = false;
      const kong: any = {
        getRouteAssociatedPlugins: jest.fn().mockImplementation(async () => (experimentalDeleted ? [] : [plugin()])),
        removeRoutePlugin: jest.fn().mockImplementation(async () => {
          experimentalDeleted = true;
        }),
      };

      await reconcilePromotions({ logger, gitlab, kong, store, config });

      expect(kong.removeRoutePlugin).toHaveBeenCalledWith('default', 'route-1', 'plugin-1');
      expect(experimentalDeleted).toBe(true);
      expect(store.transitionCalls[0][1]).toBe('awaiting-deploy');
    });
  });

  describe('code-only (issue #135) — never touches Kong for a write', () => {
    const detail = JSON.stringify({ host: repo.host, projectSlug: repo.projectSlug, projectId: repo.projectId, iid: repo.iid });

    it('discards a closed MR without calling editRoutePlugin (no tag to remove)', async () => {
      const record = row({ state: 'mr-open', mode: 'code-only', mr_ref: 'mr-url', detail });
      const store = fakeStore([record]);
      const gitlab: any = {
        getProject: jest.fn().mockResolvedValue({ archived: false, defaultBranch: 'main' }),
        getMergeRequest: jest.fn().mockResolvedValue({ state: 'closed', mergedAt: null }),
      };
      const kong: any = { getRouteAssociatedPlugins: jest.fn(), editRoutePlugin: jest.fn(), removeRoutePlugin: jest.fn() };

      await reconcilePromotions({ logger, gitlab, kong, store, config });

      expect(kong.getRouteAssociatedPlugins).not.toHaveBeenCalled();
      expect(kong.editRoutePlugin).not.toHaveBeenCalled();
      expect(store.transitionCalls).toEqual([[1, 'discarded', undefined]]);
    });

    it('parks a merged MR in awaiting-deploy without calling removeRoutePlugin (no experiment to remove)', async () => {
      const record = row({ state: 'mr-open', mode: 'code-only', mr_ref: 'mr-url', detail });
      const store = fakeStore([record]);
      const gitlab: any = {
        getProject: jest.fn().mockResolvedValue({ archived: false, defaultBranch: 'main' }),
        getMergeRequest: jest.fn().mockResolvedValue({ state: 'merged', mergedAt: '2026-09-01T00:00:00Z' }),
      };
      const kong: any = { getRouteAssociatedPlugins: jest.fn(), removeRoutePlugin: jest.fn() };

      await reconcilePromotions({ logger, gitlab, kong, store, config });

      expect(kong.getRouteAssociatedPlugins).not.toHaveBeenCalled();
      expect(kong.removeRoutePlugin).not.toHaveBeenCalled();
      expect(store.transitionCalls).toHaveLength(1);
      expect(store.transitionCalls[0][1]).toBe('awaiting-deploy');
    });

    it('aborts for teardown without calling removeRoutePlugin', async () => {
      const record = row({ state: 'mr-open', mode: 'code-only', mr_ref: 'mr-url', detail });
      const store = fakeStore([record]);
      const gitlab: any = { getProject: jest.fn().mockResolvedValue({ archived: true, defaultBranch: 'main' }) };
      const kong: any = { getRouteAssociatedPlugins: jest.fn(), removeRoutePlugin: jest.fn() };

      await reconcilePromotions({ logger, gitlab, kong, store, config });

      expect(kong.getRouteAssociatedPlugins).not.toHaveBeenCalled();
      expect(kong.removeRoutePlugin).not.toHaveBeenCalled();
      expect(store.transitionCalls[0][1]).toBe('aborted-teardown');
    });
  });

  describe('awaiting-deploy', () => {
    const detail = JSON.stringify({ ...repo, mergedAt: '2026-09-01T00:00:00Z', parkedSince: '2026-09-01T00:05:00Z' });

    it('stays parked when no successful deploy of the merge commit (or newer) exists yet', async () => {
      const record = row({ state: 'awaiting-deploy', mr_ref: 'mr-url', detail });
      const store = fakeStore([record]);
      const gitlab: any = {
        getProject: jest.fn().mockResolvedValue({ archived: false, defaultBranch: 'main' }),
        hasSuccessfulDeployAtOrAfter: jest.fn().mockResolvedValue(false),
      };
      await reconcilePromotions({ logger, gitlab, kong: {} as any, store, config });
      expect(gitlab.hasSuccessfulDeployAtOrAfter).toHaveBeenCalledWith(
        expect.objectContaining(repo),
        'main',
        '2026-09-01T00:00:00Z',
      );
      expect(store.transitionCalls).toEqual([]);
    });

    it('never restores the experiment, however long the merged chart goes undeployed (ADR-020)', async () => {
      const staleParked = JSON.stringify({
        ...repo,
        mergedAt: '2026-09-01T00:00:00Z',
        parkedSince: '2026-09-01T00:05:00Z',
        experimentRemovedAt: '2026-09-01T00:05:00Z',
      });
      const record = row({ state: 'awaiting-deploy', mr_ref: 'mr-url', detail: staleParked });
      const store = fakeStore([record]);
      const gitlab: any = {
        getProject: jest.fn().mockResolvedValue({ archived: false, defaultBranch: 'main' }),
        hasSuccessfulDeployAtOrAfter: jest.fn().mockResolvedValue(false),
      };
      const kong: any = { addPluginToRoute: jest.fn(), getRouteAssociatedPlugins: jest.fn() };

      await reconcilePromotions({ logger, gitlab, kong, store, config });

      expect(kong.addPluginToRoute).not.toHaveBeenCalled();
      expect(store.transitionCalls).toEqual([]);
    });

    it('advances to applying once a successful deploy exists, recording applyingSince', async () => {
      const record = row({ state: 'awaiting-deploy', mr_ref: 'mr-url', detail });
      const store = fakeStore([record]);
      const gitlab: any = {
        getProject: jest.fn().mockResolvedValue({ archived: false, defaultBranch: 'main' }),
        hasSuccessfulDeployAtOrAfter: jest.fn().mockResolvedValue(true),
      };
      await reconcilePromotions({ logger, gitlab, kong: {} as any, store, config });
      expect(store.transitionCalls).toHaveLength(1);
      const [id, state, extra] = store.transitionCalls[0];
      expect([id, state]).toEqual([1, 'applying']);
      const parsed = JSON.parse(extra.detail);
      expect(parsed).toMatchObject(repo);
      expect(typeof parsed.applyingSince).toBe('string');
    });
  });

  describe('applying', () => {
    function applyingRow(overrides: Partial<PromotionRecordRow> = {}, applyingSince = new Date().toISOString()): PromotionRecordRow {
      return row({
        state: 'applying',
        mr_ref: 'mr-url',
        detail: JSON.stringify({ ...repo, mergedAt: '2026-09-01T00:00:00Z', applyingSince }),
        ...overrides,
      });
    }

    it('happy path: marks codified once the KIC-owned plugin matches the snapshot, deleting nothing (ADR-020)', async () => {
      const record = applyingRow();
      const store = fakeStore([record]);
      const gitlab: any = { getProject: jest.fn().mockResolvedValue({ archived: false, defaultBranch: 'main' }) };
      const kong: any = {
        // The experiment is already gone — it was removed at merge.
        getRouteAssociatedPlugins: jest
          .fn()
          .mockResolvedValue([plugin({ id: 'plugin-2', tags: ['managed-by-ingress-controller'], config: { minute: 60 } })]),
        removeRoutePlugin: jest.fn(),
      };

      await reconcilePromotions({ logger, gitlab, kong, store, config });

      expect(kong.removeRoutePlugin).not.toHaveBeenCalled();
      expect(store.transitionCalls).toEqual([[1, 'codified', undefined]]);
    });

    it('update case: an unconverged KIC plugin with the OLD config does not pass the equality gate', async () => {
      const record = applyingRow();
      const store = fakeStore([record]);
      const gitlab: any = { getProject: jest.fn().mockResolvedValue({ archived: false, defaultBranch: 'main' }) };
      const kong: any = {
        // No experimental plugin left (already deleted on a prior tick); the
        // KIC plugin exists but still carries the OLD promoted value.
        getRouteAssociatedPlugins: jest.fn().mockResolvedValue([
          plugin({ id: 'plugin-2', tags: ['managed-by-ingress-controller'], config: { minute: 30 } }),
        ]),
        removeRoutePlugin: jest.fn(),
      };

      await reconcilePromotions({ logger, gitlab, kong, store, config });

      expect(kong.removeRoutePlugin).not.toHaveBeenCalled();
      expect(store.transitionCalls).toEqual([]); // not converged, and not timed out yet
    });

    it('timeout: marks failed without recreating the experimental plugin', async () => {
      const staleApplyingSince = new Date(Date.now() - 20 * 60_000).toISOString();
      const record = applyingRow({}, staleApplyingSince);
      const store = fakeStore([record]);
      const gitlab: any = { getProject: jest.fn().mockResolvedValue({ archived: false, defaultBranch: 'main' }) };
      const kong: any = {
        getRouteAssociatedPlugins: jest.fn().mockResolvedValue([]), // experiment removed at merge, KIC never converged
        removeRoutePlugin: jest.fn(),
        addPluginToRoute: jest.fn(),
      };

      await reconcilePromotions({ logger, gitlab, kong, store, config });

      // Recreating the experiment here would collide with the merged chart's
      // plugin on the next controller sync — that is the incident ADR-020
      // exists to prevent.
      expect(kong.addPluginToRoute).not.toHaveBeenCalled();
      expect(store.transitionCalls).toEqual([
        [1, 'failed', { detail: expect.stringContaining('did not converge') }],
      ]);
      expect(store.transitionCalls[0][2].detail).toContain('not restored');
    });

    it('does not fail before the timeout elapses', async () => {
      const record = applyingRow({}, new Date().toISOString());
      const store = fakeStore([record]);
      const gitlab: any = { getProject: jest.fn().mockResolvedValue({ archived: false, defaultBranch: 'main' }) };
      const kong: any = {
        getRouteAssociatedPlugins: jest.fn().mockResolvedValue([]),
        removeRoutePlugin: jest.fn(),
        addPluginToRoute: jest.fn(),
      };
      await reconcilePromotions({ logger, gitlab, kong, store, config });
      expect(kong.addPluginToRoute).not.toHaveBeenCalled();
      expect(store.transitionCalls).toEqual([]);
    });
  });

  describe('teardown interaction', () => {
    it('aborts the promotion and removes the leftover experimental plugin when the project is archived', async () => {
      const record = row({
        state: 'awaiting-deploy',
        mr_ref: 'mr-url',
        detail: JSON.stringify({ ...repo, mergedAt: '2026-09-01T00:00:00Z' }),
      });
      const store = fakeStore([record]);
      const gitlab: any = { getProject: jest.fn().mockResolvedValue({ archived: true, defaultBranch: 'main' }) };
      const kong: any = {
        getRouteAssociatedPlugins: jest.fn().mockResolvedValue([plugin()]),
        removeRoutePlugin: jest.fn().mockResolvedValue(undefined),
      };

      await reconcilePromotions({ logger, gitlab, kong, store, config });

      expect(kong.removeRoutePlugin).toHaveBeenCalledWith('default', 'route-1', 'plugin-1');
      expect(store.transitionCalls).toEqual([[1, 'aborted-teardown', { detail: expect.any(String) }]]);
    });

    it('aborts the promotion when the project itself is gone (404)', async () => {
      const record = row({
        state: 'mr-open',
        mr_ref: 'mr-url',
        detail: JSON.stringify(repo),
      });
      const store = fakeStore([record]);
      const gitlab: any = { getProject: jest.fn().mockRejectedValue(Object.assign(new Error('gone'), { status: 404 })) };
      const kong: any = {
        getRouteAssociatedPlugins: jest.fn().mockResolvedValue([]), // already gone on the Kong side too
        removeRoutePlugin: jest.fn(),
      };

      await reconcilePromotions({ logger, gitlab, kong, store, config });

      expect(kong.removeRoutePlugin).not.toHaveBeenCalled();
      expect(store.transitionCalls).toEqual([[1, 'aborted-teardown', { detail: expect.any(String) }]]);
    });
  });

  it('logs and continues past a record whose reconcile step throws', async () => {
    const okRecord = row({
      id: 2,
      state: 'awaiting-deploy',
      mr_ref: 'mr-url',
      detail: JSON.stringify({ ...repo, mergedAt: '2026-09-01T00:00:00Z' }),
    });
    const failingRecord = row({
      id: 1,
      detail: JSON.stringify({ host: repo.host, projectSlug: repo.projectSlug, projectId: repo.projectId }),
    });
    const store = fakeStore([failingRecord, okRecord]);
    const gitlab: any = {
      getProject: jest.fn().mockRejectedValueOnce(new Error('transient GitLab outage')).mockResolvedValue({ archived: false, defaultBranch: 'main' }),
      hasSuccessfulDeployAtOrAfter: jest.fn().mockResolvedValue(true),
    };

    await reconcilePromotions({ logger, gitlab, kong: {} as any, store, config });

    expect(store.transitionCalls).toEqual([[2, 'applying', expect.objectContaining({ detail: expect.any(String) })]]);
  });
});
