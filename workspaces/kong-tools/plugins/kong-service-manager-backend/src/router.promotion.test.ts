import * as fs from 'fs/promises';
import { mockErrorHandler, mockServices } from '@backstage/backend-test-utils';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import express from 'express';
import request from 'supertest';
import { createRouter } from './router';
import type { KongServiceManagerService } from './services/KongServiceManagerService';
import type { GitlabClient } from './services/GitlabClient';
import type { PromotionRecordRow, PromotionStore } from './services/promotionStore';
import { copyGoldenPathRepo } from './services/__fixtures__/copyGoldenPathRepo';
import { renderCheck } from './services/renderCheck';
import type { AssociatedPluginsResponse } from '@veecode-platform/backstage-plugin-kong-service-manager-common';

// Wraps the real `renderCheck` in a jest.fn so a single test can force a
// mismatch (`mockResolvedValueOnce`) — every other test in this file still
// exercises the real implementation (real `helm template` against the
// golden-path fixture) via this same pass-through.
jest.mock('./services/renderCheck', () => {
  const actual = jest.requireActual('./services/renderCheck');
  return { ...actual, renderCheck: jest.fn(actual.renderCheck) };
});
const renderCheckMock = renderCheck as jest.MockedFunction<typeof renderCheck>;

const ROUTE_ID = 'route-1';
const PLUGIN_ID = 'plugin-1';
const PROMOTE_URL = `/default/services/svc/routes/${ROUTE_ID}/plugins/${PLUGIN_ID}/promote`;
const PREVIEW_URL = `${PROMOTE_URL}/preview`;
const PROMOTIONS_URL = `/default/services/svc/routes/${ROUTE_ID}/plugins/${PLUGIN_ID}/promotions`;

const routePlugin: AssociatedPluginsResponse = {
  id: PLUGIN_ID,
  name: 'rate-limiting',
  enabled: true,
  config: { minute: 60, policy: 'local', hour: null },
  protocols: ['http', 'https'],
  tags: null,
  created_at: 1700000000,
  service: null,
  route: { id: ROUTE_ID },
  consumer: null,
};

const repo = { host: 'gitlab.example.com', projectSlug: 'group/box', projectId: 42, defaultBranch: 'main' };
const mr = { projectId: 42, iid: 7, webUrl: 'https://gitlab.example.com/group/box/-/merge_requests/7' };

function draftRow(overrides: Partial<PromotionRecordRow> = {}): PromotionRecordRow {
  return {
    id: 1,
    idempotency_key: 'key-1',
    instance: 'default',
    service_name: 'svc',
    route_id: ROUTE_ID,
    plugin_type: 'rate-limiting',
    config_snapshot: { minute: 60 },
    state: 'draft',
    mr_ref: null,
    requester_ref: 'user:default/alice',
    detail: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function kongServiceMock(): jest.Mocked<KongServiceManagerService> {
  return {
    getRouteAssociatedPlugins: jest.fn(),
    editRoutePlugin: jest.fn(),
    removeRoutePlugin: jest.fn(),
  } as unknown as jest.Mocked<KongServiceManagerService>;
}

function promotionStoreMock(): jest.Mocked<PromotionStore> {
  return {
    upsertDraft: jest.fn(),
    getById: jest.fn(),
    getByIdempotencyKey: jest.fn(),
    getActiveByRoute: jest.fn(),
    listByRoute: jest.fn(),
    transition: jest.fn(),
  } as unknown as jest.Mocked<PromotionStore>;
}

function gitlabClientMock(): jest.Mocked<GitlabClient> {
  return {
    resolveRepo: jest.fn(),
    materializeChart: jest.fn(),
    pathsExistingOnRef: jest.fn(),
    ensureBranch: jest.fn(),
    commitEdits: jest.fn(),
    findOpenMergeRequest: jest.fn(),
    openMergeRequest: jest.fn(),
    closeMergeRequest: jest.fn(),
  } as unknown as jest.Mocked<GitlabClient>;
}

async function buildApp(deps: {
  kongService: jest.Mocked<KongServiceManagerService>;
  promotionStore?: jest.Mocked<PromotionStore>;
  gitlabClient?: jest.Mocked<GitlabClient>;
}) {
  const router = await createRouter({
    httpAuth: mockServices.httpAuth(),
    permissions: mockServices.permissions.mock({
      authorize: async () => [{ result: AuthorizeResult.ALLOW }],
    }),
    kongService: deps.kongService,
    userInfo: mockServices.userInfo({ userEntityRef: 'user:default/alice' }),
    promotionStore: deps.promotionStore,
    gitlabClient: deps.gitlabClient,
  });
  const app = express();
  app.use(router);
  app.use(mockErrorHandler());
  return app;
}

/** Wires a gitlabClient mock's chart-materialization to a real copy of the golden-path fixture, so the router's real `renderCheck` call has real files to run `helm template` against. */
function withRealChart(gitlabClient: jest.Mocked<GitlabClient>): { cleanup: () => Promise<void> } {
  let dir: string;
  gitlabClient.resolveRepo.mockResolvedValue(repo);
  gitlabClient.materializeChart.mockImplementation(async () => {
    dir = await copyGoldenPathRepo();
    return { dir, cleanup: jest.fn().mockResolvedValue(undefined) };
  });
  gitlabClient.pathsExistingOnRef.mockResolvedValue(new Set(['chart/values.yaml']));
  gitlabClient.ensureBranch.mockResolvedValue(undefined);
  gitlabClient.commitEdits.mockResolvedValue({ sha: 'sha-abc' });
  return {
    cleanup: async () => {
      if (dir) await fs.rm(dir, { recursive: true, force: true });
    },
  };
}

describe('promote to code (Task P3)', () => {
  describe('POST .../promote', () => {
    it('happy path: opens a branch/commit/MR, tags the experimental plugin, returns mr-open', async () => {
      const kongService = kongServiceMock();
      kongService.getRouteAssociatedPlugins.mockResolvedValue([routePlugin]);
      kongService.editRoutePlugin.mockResolvedValue({
        ...routePlugin,
        tags: ['promotion-pending:42-7'],
      });

      const promotionStore = promotionStoreMock();
      promotionStore.getActiveByRoute.mockResolvedValue(undefined);
      promotionStore.upsertDraft.mockResolvedValue(draftRow());
      promotionStore.transition.mockResolvedValue(undefined);

      const gitlabClient = gitlabClientMock();
      const chart = withRealChart(gitlabClient);
      gitlabClient.findOpenMergeRequest.mockResolvedValue(undefined);
      gitlabClient.openMergeRequest.mockResolvedValue(mr);

      const app = await buildApp({ kongService, promotionStore, gitlabClient });
      try {
        const res = await request(app)
          .post(PROMOTE_URL)
          .send({ entityRef: 'component:default/svc' });

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ state: 'mr-open', mrRef: mr.webUrl, pluginType: 'rate-limiting' });
        expect(gitlabClient.ensureBranch).toHaveBeenCalledWith(repo, 'kong-promote/rate-limiting');
        // create-vs-update must be decided against the promotion branch, not the
        // default-branch copy `renderCheck` runs against.
        expect(gitlabClient.pathsExistingOnRef).toHaveBeenCalledWith(
          repo,
          'kong-promote/rate-limiting',
          expect.arrayContaining(['chart/values.yaml']),
        );
        expect(gitlabClient.openMergeRequest).toHaveBeenCalledTimes(1);
        expect(promotionStore.transition).toHaveBeenCalledWith(
          draftRow().id,
          'mr-open',
          expect.objectContaining({ mrRef: mr.webUrl }),
        );
        expect(kongService.editRoutePlugin).toHaveBeenCalledWith('default', ROUTE_ID, PLUGIN_ID, {
          tags: ['promotion-pending:42-7'],
        });
      } finally {
        await chart.cleanup();
      }
    });

    it('sends update (not create) for a file the promotion branch already carries from a prior commit', async () => {
      // Simulates a crash-retry or a re-promote after discard: the branch
      // survived with the template file already on it, even though the
      // default-branch chart renderCheck runs against never had it.
      const kongService = kongServiceMock();
      kongService.getRouteAssociatedPlugins.mockResolvedValue([routePlugin]);
      kongService.editRoutePlugin.mockResolvedValue(routePlugin);

      const promotionStore = promotionStoreMock();
      promotionStore.getActiveByRoute.mockResolvedValue(undefined);
      promotionStore.upsertDraft.mockResolvedValue(draftRow());
      promotionStore.transition.mockResolvedValue(undefined);

      const gitlabClient = gitlabClientMock();
      const chart = withRealChart(gitlabClient);
      gitlabClient.pathsExistingOnRef.mockResolvedValue(
        new Set(['chart/values.yaml', 'chart/templates/kongplugin-rate-limiting.yaml']),
      );
      gitlabClient.findOpenMergeRequest.mockResolvedValue(undefined);
      gitlabClient.openMergeRequest.mockResolvedValue(mr);

      const app = await buildApp({ kongService, promotionStore, gitlabClient });
      try {
        const res = await request(app).post(PROMOTE_URL).send({ entityRef: 'component:default/svc' });
        expect(res.status).toBe(201);

        const [, , , , existing] = gitlabClient.commitEdits.mock.calls[0];
        expect(existing.has('chart/templates/kongplugin-rate-limiting.yaml')).toBe(true);
      } finally {
        await chart.cleanup();
      }
    });

    it('refuses a plugin type with no promotion adapter', async () => {
      const kongService = kongServiceMock();
      kongService.getRouteAssociatedPlugins.mockResolvedValue([{ ...routePlugin, name: 'jwt' }]);

      const app = await buildApp({
        kongService,
        promotionStore: promotionStoreMock(),
        gitlabClient: gitlabClientMock(),
      });

      const res = await request(app).post(PROMOTE_URL).send({ entityRef: 'component:default/svc' });
      expect(res.status).toBe(400);
      expect(res.body.error.message).toMatch(/no promotion adapter/);
    });

    it('404s when promoting a plugin id that is not on the route', async () => {
      const kongService = kongServiceMock();
      kongService.getRouteAssociatedPlugins.mockResolvedValue([]);

      const app = await buildApp({
        kongService,
        promotionStore: promotionStoreMock(),
        gitlabClient: gitlabClientMock(),
      });

      const res = await request(app).post(PROMOTE_URL).send({ entityRef: 'component:default/svc' });
      expect(res.status).toBe(404);
    });

    it('409s when promotion is not enabled on this instance', async () => {
      const kongService = kongServiceMock();
      const app = await buildApp({ kongService });

      const res = await request(app).post(PROMOTE_URL).send({ entityRef: 'component:default/svc' });
      expect(res.status).toBe(409);
    });

    it('a retry after a crash before mr-open resumes the same draft and never opens a second MR', async () => {
      const kongService = kongServiceMock();
      kongService.getRouteAssociatedPlugins.mockResolvedValue([routePlugin]);
      kongService.editRoutePlugin.mockResolvedValue(routePlugin);

      const promotionStore = promotionStoreMock();
      const draft = draftRow();
      promotionStore.getActiveByRoute
        .mockResolvedValueOnce(undefined) // 1st call: nothing in flight yet
        .mockResolvedValueOnce(draft); // 2nd call: resumes the crashed draft
      promotionStore.upsertDraft.mockResolvedValue(draft);
      promotionStore.transition
        .mockResolvedValueOnce(undefined) // 1st call, 1st request: persists the repo coords on the draft
        .mockRejectedValueOnce(new Error('db connection lost')) // 2nd call, 1st request: crashes right after the MR is opened
        .mockResolvedValue(undefined);

      const gitlabClient = gitlabClientMock();
      const chart = withRealChart(gitlabClient);
      gitlabClient.findOpenMergeRequest
        .mockResolvedValueOnce(undefined) // 1st call: nothing open yet, opens one
        .mockResolvedValueOnce(mr); // 2nd call: finds the MR the 1st call already created
      gitlabClient.openMergeRequest.mockResolvedValue(mr);

      const app = await buildApp({ kongService, promotionStore, gitlabClient });
      try {
        const first = await request(app).post(PROMOTE_URL).send({ entityRef: 'component:default/svc' });
        expect(first.status).toBe(500);

        const second = await request(app).post(PROMOTE_URL).send({ entityRef: 'component:default/svc' });
        expect(second.status).toBe(201);

        expect(promotionStore.upsertDraft).toHaveBeenCalledTimes(1);
        expect(gitlabClient.openMergeRequest).toHaveBeenCalledTimes(1); // never a second MR
        expect(gitlabClient.findOpenMergeRequest).toHaveBeenCalledTimes(2);
      } finally {
        await chart.cleanup();
      }
    });
  });

  describe('POST .../promote/preview', () => {
    it('happy path: returns the edited files and normalized config without writing to the store or GitLab', async () => {
      const kongService = kongServiceMock();
      kongService.getRouteAssociatedPlugins.mockResolvedValue([routePlugin]);

      const promotionStore = promotionStoreMock();
      const gitlabClient = gitlabClientMock();
      const chart = withRealChart(gitlabClient);

      const app = await buildApp({ kongService, promotionStore, gitlabClient });
      try {
        const res = await request(app).post(PREVIEW_URL).send({ entityRef: 'component:default/svc' });

        expect(res.status).toBe(200);
        expect(res.body.normalizedConfig).toEqual({ minute: 60 });
        expect(res.body.files).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ path: 'chart/values.yaml' }),
            expect.objectContaining({ path: 'chart/templates/kongplugin-rate-limiting.yaml' }),
          ]),
        );
        expect(res.body.files).toHaveLength(2);

        // A preview never persists a draft, mutates the chart repo, or opens an MR.
        expect(promotionStore.upsertDraft).not.toHaveBeenCalled();
        expect(promotionStore.transition).not.toHaveBeenCalled();
        expect(gitlabClient.ensureBranch).not.toHaveBeenCalled();
        expect(gitlabClient.commitEdits).not.toHaveBeenCalled();
        expect(gitlabClient.openMergeRequest).not.toHaveBeenCalled();
      } finally {
        await chart.cleanup();
      }
    });

    it('refuses a plugin type with no promotion adapter', async () => {
      const kongService = kongServiceMock();
      kongService.getRouteAssociatedPlugins.mockResolvedValue([{ ...routePlugin, name: 'jwt' }]);

      const app = await buildApp({
        kongService,
        promotionStore: promotionStoreMock(),
        gitlabClient: gitlabClientMock(),
      });

      const res = await request(app).post(PREVIEW_URL).send({ entityRef: 'component:default/svc' });
      expect(res.status).toBe(400);
      expect(res.body.error.message).toMatch(/no promotion adapter/);
    });

    it('400s with the diff detail when the generated chart does not reproduce the live config', async () => {
      const kongService = kongServiceMock();
      kongService.getRouteAssociatedPlugins.mockResolvedValue([routePlugin]);

      const promotionStore = promotionStoreMock();
      const gitlabClient = gitlabClientMock();
      const chart = withRealChart(gitlabClient);

      renderCheckMock.mockResolvedValueOnce({ equal: false, diff: 'live vs rendered mismatch' });

      const app = await buildApp({ kongService, promotionStore, gitlabClient });
      try {
        const res = await request(app).post(PREVIEW_URL).send({ entityRef: 'component:default/svc' });

        expect(res.status).toBe(400);
        expect(res.body.error.message).toMatch(/does not reproduce the live config/);
        expect(res.body.error.message).toContain('live vs rendered mismatch');
      } finally {
        await chart.cleanup();
      }
    });

    it('403s when permission is denied', async () => {
      const kongService = kongServiceMock();
      const router = await createRouter({
        httpAuth: mockServices.httpAuth(),
        permissions: mockServices.permissions.mock({
          authorize: async () => [{ result: AuthorizeResult.DENY }],
        }),
        kongService,
        userInfo: mockServices.userInfo({ userEntityRef: 'user:default/alice' }),
        promotionStore: promotionStoreMock(),
        gitlabClient: gitlabClientMock(),
      });
      const app = express();
      app.use(router);
      app.use(mockErrorHandler());

      const res = await request(app).post(PREVIEW_URL).send({ entityRef: 'component:default/svc' });
      expect(res.status).toBe(403);
    });
  });

  describe('freeze while a promotion is open', () => {
    it('PATCH route plugin is frozen with a 409 and the MR link', async () => {
      const kongService = kongServiceMock();
      kongService.getRouteAssociatedPlugins.mockResolvedValue([routePlugin]);

      const promotionStore = promotionStoreMock();
      promotionStore.getActiveByRoute.mockResolvedValue(
        draftRow({ state: 'mr-open', mr_ref: mr.webUrl }),
      );

      const app = await buildApp({ kongService, promotionStore, gitlabClient: gitlabClientMock() });
      const res = await request(app)
        .patch(`/default/routes/${ROUTE_ID}/plugins/${PLUGIN_ID}`)
        .send({ enabled: false });

      expect(res.status).toBe(409);
      expect(res.body.error.message).toContain(mr.webUrl);
      expect(kongService.editRoutePlugin).not.toHaveBeenCalled();
    });

    it('DELETE route plugin is frozen with a 409', async () => {
      const kongService = kongServiceMock();
      kongService.getRouteAssociatedPlugins.mockResolvedValue([routePlugin]);

      const promotionStore = promotionStoreMock();
      promotionStore.getActiveByRoute.mockResolvedValue(draftRow({ state: 'applying', mr_ref: mr.webUrl }));

      const app = await buildApp({ kongService, promotionStore, gitlabClient: gitlabClientMock() });
      const res = await request(app).delete(`/default/routes/${ROUTE_ID}/plugins/${PLUGIN_ID}`);

      expect(res.status).toBe(409);
      expect(kongService.removeRoutePlugin).not.toHaveBeenCalled();
    });

    it('PATCH route plugin is unaffected when promotion is disabled (no store)', async () => {
      const kongService = kongServiceMock();
      kongService.editRoutePlugin.mockResolvedValue(routePlugin);

      const app = await buildApp({ kongService });
      const res = await request(app)
        .patch(`/default/routes/${ROUTE_ID}/plugins/${PLUGIN_ID}`)
        .send({ enabled: false });

      expect(res.status).toBe(200);
      expect(kongService.getRouteAssociatedPlugins).not.toHaveBeenCalled();
    });
  });

  describe('DELETE .../promote (discard)', () => {
    it('closes the MR, untags the plugin, and marks the record discarded', async () => {
      const kongService = kongServiceMock();
      const taggedPlugin = { ...routePlugin, tags: ['promotion-pending:42-7', 'managed'] };
      kongService.getRouteAssociatedPlugins.mockResolvedValue([taggedPlugin]);
      kongService.editRoutePlugin.mockResolvedValue({ ...taggedPlugin, tags: ['managed'] });

      const promotionStore = promotionStoreMock();
      const active = draftRow({
        state: 'mr-open',
        mr_ref: mr.webUrl,
        detail: JSON.stringify({ host: repo.host, projectSlug: repo.projectSlug, projectId: mr.projectId, iid: mr.iid }),
      });
      promotionStore.getActiveByRoute.mockResolvedValue(active);
      promotionStore.transition.mockResolvedValue(undefined);

      const gitlabClient = gitlabClientMock();
      gitlabClient.closeMergeRequest.mockResolvedValue(undefined);

      const app = await buildApp({ kongService, promotionStore, gitlabClient });
      const res = await request(app).delete(PROMOTE_URL);

      expect(res.status).toBe(204);
      expect(gitlabClient.closeMergeRequest).toHaveBeenCalledWith(
        { host: repo.host, projectSlug: repo.projectSlug, projectId: mr.projectId, iid: mr.iid },
        mr.iid,
      );
      expect(kongService.editRoutePlugin).toHaveBeenCalledWith('default', ROUTE_ID, PLUGIN_ID, {
        tags: ['managed'],
      });
      expect(promotionStore.transition).toHaveBeenCalledWith(active.id, 'discarded');
    });

    it('discarding a crashed draft (no MR ever opened) skips the MR close and untag', async () => {
      const kongService = kongServiceMock();
      kongService.getRouteAssociatedPlugins.mockResolvedValue([routePlugin]);

      const promotionStore = promotionStoreMock();
      promotionStore.getActiveByRoute.mockResolvedValue(draftRow()); // state: draft, mr_ref: null
      promotionStore.transition.mockResolvedValue(undefined);

      const gitlabClient = gitlabClientMock();

      const app = await buildApp({ kongService, promotionStore, gitlabClient });
      const res = await request(app).delete(PROMOTE_URL);

      expect(res.status).toBe(204);
      expect(gitlabClient.closeMergeRequest).not.toHaveBeenCalled();
      expect(kongService.editRoutePlugin).not.toHaveBeenCalled();
      expect(promotionStore.transition).toHaveBeenCalledWith(draftRow().id, 'discarded');
    });

    it('404s when there is no open promotion to discard', async () => {
      const kongService = kongServiceMock();
      kongService.getRouteAssociatedPlugins.mockResolvedValue([routePlugin]);

      const promotionStore = promotionStoreMock();
      promotionStore.getActiveByRoute.mockResolvedValue(undefined);

      const app = await buildApp({ kongService, promotionStore, gitlabClient: gitlabClientMock() });
      const res = await request(app).delete(PROMOTE_URL);
      expect(res.status).toBe(404);
    });
  });

  describe('GET .../promotions', () => {
    it('returns the route plugin history', async () => {
      const kongService = kongServiceMock();
      kongService.getRouteAssociatedPlugins.mockResolvedValue([routePlugin]);

      const promotionStore = promotionStoreMock();
      promotionStore.listByRoute.mockResolvedValue([draftRow()]);

      const app = await buildApp({ kongService, promotionStore, gitlabClient: gitlabClientMock() });
      const res = await request(app).get(PROMOTIONS_URL);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ state: 'draft', pluginType: 'rate-limiting' });
    });

    it('returns an empty array when promotion is disabled', async () => {
      const kongService = kongServiceMock();
      const app = await buildApp({ kongService });
      const res = await request(app).get(PROMOTIONS_URL);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });
});
