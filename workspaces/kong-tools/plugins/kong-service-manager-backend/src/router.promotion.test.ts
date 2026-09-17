import * as fs from 'fs/promises';
import * as path from 'path';
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
const mr = {
  projectId: 42,
  iid: 7,
  webUrl: 'https://gitlab.example.com/group/box/-/merge_requests/7',
  // What the promote endpoint writes: the open-MR lookup returns it and the ownership guard reads the route id from it (ADR-022).
  description: `Promotes the experimental \`rate-limiting\` plugin on route \`${ROUTE_ID}\` (service \`svc\`, Kong instance \`default\`) from ClickOps to the chart.`,
};

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
    mode: 'experiment',
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
    // No defaultTags by default — matches an instance with no ownership
    // signal, where every plugin is promotable (today's behaviour).
    getInstanceDefaultTags: jest.fn(),
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
    deleteBranch: jest.fn(),
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
  editInCodeEnabled?: boolean;
  /** Stubs the ADR-018 helm gate present whenever promotion is actually enabled — needed to exercise the capabilities endpoint's non-disabled branch. */
  helmAvailable?: boolean;
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
    editInCodeEnabled: deps.editInCodeEnabled,
    helmGate:
      deps.helmAvailable === undefined
        ? undefined
        : { getCapability: async () => ({ available: deps.helmAvailable!, path: 'helm' }) },
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

/** A rate-limiting KongPlugin template that routes `minute` through chart values (the golden-path scaffolder shape) — editing the value in `values.yaml` changes the rendered config. */
const VALUES_ROUTED_RL_TEMPLATE = `apiVersion: configuration.konghq.com/v1
kind: KongPlugin
metadata:
  name: {{ .Release.Name }}-rate-limiting
plugin: rate-limiting
config:
  minute: {{ .Values.kongPlugins.rateLimiting.minute }}
  policy: local
`;

/** A rate-limiting template that hardcodes `minute` — editing `values.yaml` can never change the rendered config, so edit-in-code must refuse. */
const HARDCODED_RL_TEMPLATE = `apiVersion: configuration.konghq.com/v1
kind: KongPlugin
metadata:
  name: {{ .Release.Name }}-rate-limiting
plugin: rate-limiting
config:
  minute: 10
  policy: local
`;

/**
 * Like `withRealChart`, but the materialized chart ALREADY declares a
 * code-owned rate-limiting KongPlugin (authored by the service team, not the
 * portal) — the realistic edit-in-code target. `template` is written to
 * `chart/templates/kongplugin-rate-limiting.yaml`; `extraTemplate`, when
 * given, adds a second manifest of the same type.
 */
function withCodeOwnedChart(
  gitlabClient: jest.Mocked<GitlabClient>,
  template: string,
  extraTemplate?: string,
): { cleanup: () => Promise<void> } {
  let dir: string;
  gitlabClient.resolveRepo.mockResolvedValue(repo);
  gitlabClient.materializeChart.mockImplementation(async () => {
    dir = await copyGoldenPathRepo();
    await fs.writeFile(path.join(dir, 'chart/templates/kongplugin-rate-limiting.yaml'), template, 'utf8');
    if (extraTemplate) {
      await fs.writeFile(path.join(dir, 'chart/templates/kongplugin-rate-limiting-2.yaml'), extraTemplate, 'utf8');
    }
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
        // No MR open for the branch → any leftover branch is stale and is
        // recreated from the default branch, never committed onto (ADR-022).
        expect(gitlabClient.deleteBranch).toHaveBeenCalledWith(repo, 'kong-promote/rate-limiting');
        expect(gitlabClient.deleteBranch.mock.invocationCallOrder[0]).toBeLessThan(
          gitlabClient.ensureBranch.mock.invocationCallOrder[0],
        );
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

    it('refuses (409) when the per-type branch already carries an open MR for ANOTHER route (ADR-022 ownership guard)', async () => {
      const kongService = kongServiceMock();
      kongService.getRouteAssociatedPlugins.mockResolvedValue([routePlugin]);
      const promotionStore = promotionStoreMock();
      promotionStore.getActiveByRoute.mockResolvedValue(undefined);
      promotionStore.upsertDraft.mockResolvedValue(draftRow());
      promotionStore.transition.mockResolvedValue(undefined);

      const gitlabClient = gitlabClientMock();
      const chart = withRealChart(gitlabClient);
      gitlabClient.findOpenMergeRequest.mockResolvedValue({ ...mr, description: 'Promotes the experimental `rate-limiting` plugin on route `route-OTHER` …' });

      const app = await buildApp({ kongService, promotionStore, gitlabClient });
      try {
        const res = await request(app).post(PROMOTE_URL).send({ entityRef: 'component:default/svc' });
        expect(res.status).toBe(409);
        expect(res.body.error.message).toMatch(/Another promotion of 'rate-limiting' is open/);
        expect(gitlabClient.deleteBranch).not.toHaveBeenCalled();
        expect(gitlabClient.commitEdits).not.toHaveBeenCalled();
      } finally {
        await chart.cleanup();
      }
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
        // The retry found the MR still open, so the branch carrying its commit is kept (ADR-022).
        expect(gitlabClient.deleteBranch).toHaveBeenCalledTimes(1);
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

        // A preview never persists a draft, mutates the chart repo, opens an MR, or tags the plugin.
        expect(promotionStore.upsertDraft).not.toHaveBeenCalled();
        expect(promotionStore.transition).not.toHaveBeenCalled();
        expect(gitlabClient.ensureBranch).not.toHaveBeenCalled();
        expect(gitlabClient.commitEdits).not.toHaveBeenCalled();
        expect(gitlabClient.openMergeRequest).not.toHaveBeenCalled();
        expect(kongService.editRoutePlugin).not.toHaveBeenCalled();
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

  describe('plugin ownership gate (code-owned vs portal-managed)', () => {
    it('promote 400s a code-owned plugin — missing the instance defaultTags', async () => {
      const kongService = kongServiceMock();
      kongService.getRouteAssociatedPlugins.mockResolvedValue([routePlugin]); // tags: null
      kongService.getInstanceDefaultTags.mockReturnValue(['portal-managed']);

      const app = await buildApp({
        kongService,
        promotionStore: promotionStoreMock(),
        gitlabClient: gitlabClientMock(),
      });

      const res = await request(app).post(PROMOTE_URL).send({ entityRef: 'component:default/svc' });
      expect(res.status).toBe(400);
      expect(res.body.error.message).toMatch(/not portal-managed \(code-owned\)/);
    });

    it('preview 400s a code-owned plugin — missing the instance defaultTags', async () => {
      const kongService = kongServiceMock();
      kongService.getRouteAssociatedPlugins.mockResolvedValue([routePlugin]); // tags: null
      kongService.getInstanceDefaultTags.mockReturnValue(['portal-managed']);

      const app = await buildApp({
        kongService,
        promotionStore: promotionStoreMock(),
        gitlabClient: gitlabClientMock(),
      });

      const res = await request(app).post(PREVIEW_URL).send({ entityRef: 'component:default/svc' });
      expect(res.status).toBe(400);
      expect(res.body.error.message).toMatch(/not portal-managed \(code-owned\)/);
    });

    it('promote is unchanged (201) for a plugin carrying all of the instance defaultTags', async () => {
      const kongService = kongServiceMock();
      const managedPlugin = { ...routePlugin, tags: ['portal-managed'] };
      kongService.getRouteAssociatedPlugins.mockResolvedValue([managedPlugin]);
      kongService.getInstanceDefaultTags.mockReturnValue(['portal-managed']);
      kongService.editRoutePlugin.mockResolvedValue({
        ...managedPlugin,
        tags: ['portal-managed', 'promotion-pending:42-7'],
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
        const res = await request(app).post(PROMOTE_URL).send({ entityRef: 'component:default/svc' });
        expect(res.status).toBe(201);
      } finally {
        await chart.cleanup();
      }
    });

    it('preview is unchanged (200) for a plugin carrying all of the instance defaultTags', async () => {
      const kongService = kongServiceMock();
      const managedPlugin = { ...routePlugin, tags: ['portal-managed'] };
      kongService.getRouteAssociatedPlugins.mockResolvedValue([managedPlugin]);
      kongService.getInstanceDefaultTags.mockReturnValue(['portal-managed']);

      const promotionStore = promotionStoreMock();
      const gitlabClient = gitlabClientMock();
      const chart = withRealChart(gitlabClient);

      const app = await buildApp({ kongService, promotionStore, gitlabClient });
      try {
        const res = await request(app).post(PREVIEW_URL).send({ entityRef: 'component:default/svc' });
        expect(res.status).toBe(200);
      } finally {
        await chart.cleanup();
      }
    });

    it('promote is unchanged (201) when the instance has no defaultTags configured', async () => {
      const kongService = kongServiceMock();
      kongService.getRouteAssociatedPlugins.mockResolvedValue([routePlugin]); // tags: null
      kongService.getInstanceDefaultTags.mockReturnValue(undefined);
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
        const res = await request(app).post(PROMOTE_URL).send({ entityRef: 'component:default/svc' });
        expect(res.status).toBe(201);
      } finally {
        await chart.cleanup();
      }
    });
  });

  describe('edit in code (issue #135)', () => {
    // Code-owned in the only shape edit-in-code accepts: no portal
    // defaultTags, and reconciled by the Kong Ingress Controller — the same
    // signal the finalizer needs to ever see it converge.
    const codeOwnedPlugin = { ...routePlugin, tags: ['managed-by-ingress-controller'] };

    function kongServiceForCodeOwned(): jest.Mocked<KongServiceManagerService> {
      const kongService = kongServiceMock();
      kongService.getRouteAssociatedPlugins.mockResolvedValue([codeOwnedPlugin]);
      kongService.getInstanceDefaultTags.mockReturnValue(['portal-managed']);
      return kongService;
    }

    it('promote 400s a portal-managed plugin that sends a config — its config always comes from Kong', async () => {
      const kongService = kongServiceMock();
      kongService.getRouteAssociatedPlugins.mockResolvedValue([{ ...routePlugin, tags: ['portal-managed'] }]);
      kongService.getInstanceDefaultTags.mockReturnValue(['portal-managed']);

      const app = await buildApp({
        kongService,
        promotionStore: promotionStoreMock(),
        gitlabClient: gitlabClientMock(),
        editInCodeEnabled: true,
      });

      const res = await request(app)
        .post(PROMOTE_URL)
        .send({ entityRef: 'component:default/svc', config: { minute: 30 } });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toMatch(/portal-managed/);
      expect(res.body.error.message).toMatch(/does not accept an edited/);
    });

    it('promote 201s a code-owned plugin with editInCode on and a config — mode code-only, no experiment tagged', async () => {
      const kongService = kongServiceForCodeOwned();

      const promotionStore = promotionStoreMock();
      promotionStore.getActiveByRoute.mockResolvedValue(undefined);
      promotionStore.upsertDraft.mockResolvedValue(
        // config_snapshot mirrors what rateLimitingAdapter.fromRendered actually
        // produces ({ minute }) — the same normalized shape renderCheck's own
        // fromRendered comparison expects; extra raw-config keys here would
        // make renderCheck see a (false) mismatch and 409.
        draftRow({ mode: 'code-only', config_snapshot: { minute: 30 } }),
      );
      promotionStore.transition.mockResolvedValue(undefined);

      const gitlabClient = gitlabClientMock();
      // The chart already declares the code-owned plugin, routing `minute`
      // through values — the realistic edit-in-code target (B1).
      const chart = withCodeOwnedChart(gitlabClient, VALUES_ROUTED_RL_TEMPLATE);
      gitlabClient.findOpenMergeRequest.mockResolvedValue(undefined);
      gitlabClient.openMergeRequest.mockResolvedValue(mr);

      const app = await buildApp({ kongService, promotionStore, gitlabClient, editInCodeEnabled: true });
      try {
        const res = await request(app)
          .post(PROMOTE_URL)
          .send({ entityRef: 'component:default/svc', config: { minute: 30 } });

        expect(res.status).toBe(201);
        expect(res.body.mode).toBe('code-only');
        expect(promotionStore.upsertDraft).toHaveBeenCalledWith(
          expect.objectContaining({ mode: 'code-only' }),
        );
        // No experiment ever existed for a code-only edit — nothing to tag.
        expect(kongService.editRoutePlugin).not.toHaveBeenCalled();
        // B1: the MR only touches values.yaml — the team's template is never
        // rewritten (no op:'create' edit reaches the commit).
        const committedEdits = gitlabClient.commitEdits.mock.calls[0][3];
        expect(committedEdits.every((e: { op: string }) => e.op !== 'create')).toBe(true);
        expect(committedEdits.map((e: { path: string }) => e.path)).toEqual(['chart/values.yaml']);
        // ...and the written values.yaml is a surgical change: the edited
        // value lands and the team's existing comment survives (a load/dump
        // round-trip would have dropped it — the whole point of #138).
        const materialized = await gitlabClient.materializeChart.mock.results[0].value;
        const writtenValues = await fs.readFile(path.join(materialized.dir, 'chart/values.yaml'), 'utf8');
        expect(writtenValues).toMatch(/minute: 30/);
        expect(writtenValues).toMatch(/kongPlugins is intentionally empty/);
      } finally {
        await chart.cleanup();
      }
    });

    it('promote 400s a code-owned edit that changes a field the adapter cannot carry — no silent drop (F2)', async () => {
      const kongService = kongServiceForCodeOwned();
      const promotionStore = promotionStoreMock();
      promotionStore.getActiveByRoute.mockResolvedValue(undefined);
      const gitlabClient = gitlabClientMock();

      const app = await buildApp({ kongService, promotionStore, gitlabClient, editInCodeEnabled: true });

      // rate-limiting routes only `minute` through values (`policy` is fixed in
      // the template). Changing `policy` too would vanish from the MR silently
      // and the promotion could still finish codified without it.
      const res = await request(app)
        .post(PROMOTE_URL)
        .send({ entityRef: 'component:default/svc', config: { minute: 30, policy: 'redis' } });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toMatch(/'policy'/);
      expect(res.body.error.message).toMatch(/not supported/);
      // Rejected before any draft or GitLab write — nothing stranded.
      expect(promotionStore.upsertDraft).not.toHaveBeenCalled();
      expect(gitlabClient.commitEdits).not.toHaveBeenCalled();
    });

    it('preview 400s the same unsupported-field edit, so the review dialog blocks promote (F2)', async () => {
      const kongService = kongServiceForCodeOwned();
      const gitlabClient = gitlabClientMock();

      const app = await buildApp({
        kongService,
        promotionStore: promotionStoreMock(),
        gitlabClient,
        editInCodeEnabled: true,
      });

      const res = await request(app)
        .post(PREVIEW_URL)
        .send({ entityRef: 'component:default/svc', config: { minute: 30, policy: 'redis' } });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toMatch(/'policy'/);
      expect(gitlabClient.materializeChart).not.toHaveBeenCalled();
    });

    it('promote 409s a code-owned plugin whose chart hardcodes the field — editing values can\'t reproduce it (B1)', async () => {
      const kongService = kongServiceForCodeOwned();

      const promotionStore = promotionStoreMock();
      promotionStore.getActiveByRoute.mockResolvedValue(undefined);
      promotionStore.upsertDraft.mockResolvedValue(draftRow({ mode: 'code-only', config_snapshot: { minute: 30 } }));
      promotionStore.transition.mockResolvedValue(undefined);

      const gitlabClient = gitlabClientMock();
      const chart = withCodeOwnedChart(gitlabClient, HARDCODED_RL_TEMPLATE);
      gitlabClient.findOpenMergeRequest.mockResolvedValue(undefined);

      const app = await buildApp({ kongService, promotionStore, gitlabClient, editInCodeEnabled: true });
      try {
        const res = await request(app)
          .post(PROMOTE_URL)
          .send({ entityRef: 'component:default/svc', config: { minute: 30 } });

        expect(res.status).toBe(409);
        expect(res.body.error.message).toMatch(/does not expose 'rate-limiting' as an editable value/);
        // Nothing was committed — the write is refused before the MR.
        expect(gitlabClient.commitEdits).not.toHaveBeenCalled();
      } finally {
        await chart.cleanup();
      }
    });

    it('promote 409s when the chart declares the plugin type more than once — can\'t tell which one to edit (B1)', async () => {
      const kongService = kongServiceForCodeOwned();

      const promotionStore = promotionStoreMock();
      promotionStore.getActiveByRoute.mockResolvedValue(undefined);
      promotionStore.upsertDraft.mockResolvedValue(draftRow({ mode: 'code-only', config_snapshot: { minute: 30 } }));
      promotionStore.transition.mockResolvedValue(undefined);

      const gitlabClient = gitlabClientMock();
      const chart = withCodeOwnedChart(gitlabClient, VALUES_ROUTED_RL_TEMPLATE, VALUES_ROUTED_RL_TEMPLATE);
      gitlabClient.findOpenMergeRequest.mockResolvedValue(undefined);

      const app = await buildApp({ kongService, promotionStore, gitlabClient, editInCodeEnabled: true });
      try {
        const res = await request(app)
          .post(PROMOTE_URL)
          .send({ entityRef: 'component:default/svc', config: { minute: 30 } });

        expect(res.status).toBe(409);
        expect(res.body.error.message).toMatch(/2 KongPlugin manifests/);
        expect(gitlabClient.commitEdits).not.toHaveBeenCalled();
      } finally {
        await chart.cleanup();
      }
    });

    it('promote 400s a code-owned plugin the ingress controller does not manage — the finalizer could never converge it', async () => {
      const kongService = kongServiceMock();
      kongService.getRouteAssociatedPlugins.mockResolvedValue([{ ...routePlugin, tags: [] }]);
      kongService.getInstanceDefaultTags.mockReturnValue(['portal-managed']);

      const app = await buildApp({
        kongService,
        promotionStore: promotionStoreMock(),
        gitlabClient: gitlabClientMock(),
        editInCodeEnabled: true,
      });

      const res = await request(app)
        .post(PROMOTE_URL)
        .send({ entityRef: 'component:default/svc', config: { minute: 30 } });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toMatch(/managed-by-ingress-controller/);
    });

    it('promote 400s a code-owned plugin without editInCode enabled — verbatim pre-existing message', async () => {
      const kongService = kongServiceForCodeOwned();

      const app = await buildApp({
        kongService,
        promotionStore: promotionStoreMock(),
        gitlabClient: gitlabClientMock(),
        editInCodeEnabled: false,
      });

      const res = await request(app)
        .post(PROMOTE_URL)
        .send({ entityRef: 'component:default/svc', config: { minute: 30 } });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toMatch(/not portal-managed \(code-owned\)/);
    });

    it('promote 400s a code-owned plugin with editInCode on but no config — same gate as no switch at all', async () => {
      const kongService = kongServiceForCodeOwned();

      const app = await buildApp({
        kongService,
        promotionStore: promotionStoreMock(),
        gitlabClient: gitlabClientMock(),
        editInCodeEnabled: true,
      });

      const res = await request(app).post(PROMOTE_URL).send({ entityRef: 'component:default/svc' });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toMatch(/not portal-managed \(code-owned\)/);
    });

    it('promote 409s when the edited config equals the live config — nothing to promote', async () => {
      const kongService = kongServiceForCodeOwned(); // config: { minute: 60, policy: 'local', hour: null }

      const app = await buildApp({
        kongService,
        promotionStore: promotionStoreMock(),
        gitlabClient: gitlabClientMock(),
        editInCodeEnabled: true,
      });

      const res = await request(app)
        .post(PROMOTE_URL)
        .send({ entityRef: 'component:default/svc', config: { minute: 60, policy: 'local', hour: null } });

      expect(res.status).toBe(409);
      expect(res.body.error.message).toMatch(/nothing to promote/);
    });

    it('promote 409s a code-only request while another promotion is already open for the route plugin', async () => {
      const kongService = kongServiceForCodeOwned();

      const promotionStore = promotionStoreMock();
      promotionStore.getActiveByRoute.mockResolvedValue(
        draftRow({ state: 'mr-open', mr_ref: mr.webUrl }),
      );

      const app = await buildApp({
        kongService,
        promotionStore,
        gitlabClient: gitlabClientMock(),
        editInCodeEnabled: true,
      });

      const res = await request(app)
        .post(PROMOTE_URL)
        .send({ entityRef: 'component:default/svc', config: { minute: 30 } });

      expect(res.status).toBe(409);
      expect(res.body.error.message).toContain(mr.webUrl);
      expect(promotionStore.upsertDraft).not.toHaveBeenCalled();
    });

    it('preview stays permissive on an edited config that equals the live config (unlike promote)', async () => {
      const kongService = kongServiceForCodeOwned();
      const gitlabClient = gitlabClientMock();
      const chart = withCodeOwnedChart(gitlabClient, VALUES_ROUTED_RL_TEMPLATE);

      const app = await buildApp({
        kongService,
        promotionStore: promotionStoreMock(),
        gitlabClient,
        editInCodeEnabled: true,
      });
      try {
        const res = await request(app)
          .post(PREVIEW_URL)
          .send({ entityRef: 'component:default/svc', config: { minute: 60, policy: 'local', hour: null } });

        expect(res.status).toBe(200);
      } finally {
        await chart.cleanup();
      }
    });

    it('GET .../promotion/capabilities exposes editInCode', async () => {
      const kongService = kongServiceMock();
      const app = await buildApp({
        kongService,
        promotionStore: promotionStoreMock(),
        gitlabClient: gitlabClientMock(),
        editInCodeEnabled: true,
        helmAvailable: true,
      });

      const res = await request(app).get('/default/promotion/capabilities');
      expect(res.status).toBe(200);
      expect(res.body.editInCode).toBe(true);
    });

    it('GET .../promotion/capabilities defaults editInCode to false', async () => {
      const kongService = kongServiceMock();
      const app = await buildApp({
        kongService,
        promotionStore: promotionStoreMock(),
        gitlabClient: gitlabClientMock(),
        helmAvailable: true,
      });

      const res = await request(app).get('/default/promotion/capabilities');
      expect(res.status).toBe(200);
      expect(res.body.editInCode).toBe(false);
    });

    it('GET .../promotion/capabilities reports editInCode false when promotion (and its helm gate) are not enabled at all', async () => {
      const kongService = kongServiceMock();
      const app = await buildApp({ kongService, editInCodeEnabled: true }); // no store/gitlabClient/helmGate — disabled instance
      const res = await request(app).get('/default/promotion/capabilities');
      expect(res.status).toBe(200);
      expect(res.body.editInCode).toBe(false);
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

    it('exposes detail only for failure records, never for the MR-coordinates JSON of an active state', async () => {
      const kongService = kongServiceMock();
      kongService.getRouteAssociatedPlugins.mockResolvedValue([routePlugin]);

      const promotionStore = promotionStoreMock();
      promotionStore.listByRoute.mockResolvedValue([
        draftRow({
          id: 2,
          state: 'failed-restored',
          detail: 'applyTimeoutMinutes (30) exceeded waiting for the code-owned plugin to converge; experimental plugin restored.',
        }),
        draftRow({
          id: 3,
          state: 'mr-open',
          mr_ref: mr.webUrl,
          detail: JSON.stringify({ host: repo.host, projectSlug: repo.projectSlug, projectId: mr.projectId, iid: mr.iid }),
        }),
        draftRow({
          id: 4,
          state: 'failed',
          detail: "code-owned 'rate-limiting' plugin did not converge on route 'route-1' within 10 min",
        }),
      ]);

      const app = await buildApp({ kongService, promotionStore, gitlabClient: gitlabClientMock() });
      const res = await request(app).get(PROMOTIONS_URL);

      expect(res.status).toBe(200);
      const failedRestored = res.body.find((r: { id: number }) => r.id === 2);
      const mrOpen = res.body.find((r: { id: number }) => r.id === 3);
      const failed = res.body.find((r: { id: number }) => r.id === 4);
      expect(failedRestored.detail).toMatch(/applyTimeoutMinutes/);
      expect(mrOpen).not.toHaveProperty('detail');
      expect(failed.detail).toMatch(/did not converge/);
    });
  });
});
