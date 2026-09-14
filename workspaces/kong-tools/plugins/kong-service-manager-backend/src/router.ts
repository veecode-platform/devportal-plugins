import { randomUUID } from 'crypto';
import { HttpAuthService, PermissionsService, UserInfoService } from '@backstage/backend-plugin-api';
import { ConflictError, InputError, NotAllowedError, NotFoundError } from '@backstage/errors';
import { AuthorizeResult, type BasicPermission } from '@backstage/plugin-permission-common';
import { z } from 'zod';
import express from 'express';
import Router from 'express-promise-router';
import type {
  AssociatedPluginsResponse,
  CreateRoute,
  PromotionState,
} from '@veecode-platform/backstage-plugin-kong-service-manager-common';
import {
  kongServiceReadPermission,
  kongPluginsReadPermission,
  kongRoutesReadPermission,
  kongApplyPluginServicePermission,
  kongUpdateServicePluginPermission,
  kongDisableServicePluginPermission,
  kongRouteCreatePermission,
  kongRouteUpdatePermission,
  kongRouteDeletePermission,
  kongApplyPluginRoutePermission,
  kongUpdateRoutePluginPermission,
  kongDisableRoutePluginPermission,
  kongInstancesReadPermission,
  kongPluginPromotePermission,
} from '@veecode-platform/backstage-plugin-kong-service-manager-common';
import { KongServiceManagerService } from './services/KongServiceManagerService';
import { getAdapter } from './services/adapters';
import type { NormalizedConfig } from './services/adapters/types';
import { renderCheck } from './services/renderCheck';
import { GitlabClient } from './services/GitlabClient';
import type { PromotionRecordRow, PromotionStore } from './services/promotionStore';

/** GitLab project/MR coordinates needed to close the promotion's MR — packed into the `detail` column (design 02's record shape has no dedicated field for these). */
interface MrDetail {
  host: string;
  projectSlug: string;
  projectId: number;
  iid: number;
}

function encodeMrDetail(detail: MrDetail): string {
  return JSON.stringify(detail);
}

function decodeMrDetail(detail: string | null): MrDetail | undefined {
  if (!detail) return undefined;
  try {
    return JSON.parse(detail) as MrDetail;
  } catch {
    return undefined;
  }
}

interface PromotionDto {
  id: number;
  instance: string;
  serviceName: string;
  routeId: string;
  pluginType: string;
  state: PromotionState;
  mrRef: string | null;
  requesterRef: string;
  createdAt: string;
  updatedAt: string;
}

function toPromotionDto(row: PromotionRecordRow): PromotionDto {
  return {
    id: row.id,
    instance: row.instance,
    serviceName: row.service_name,
    routeId: row.route_id,
    pluginType: row.plugin_type,
    state: row.state,
    mrRef: row.mr_ref,
    requesterRef: row.requester_ref,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

export async function createRouter({
  httpAuth,
  permissions,
  kongService,
  userInfo,
  promotionStore,
  gitlabClient,
}: {
  httpAuth: HttpAuthService;
  permissions: PermissionsService;
  kongService: KongServiceManagerService;
  /** Requester identity for promotion audit records — only needed when promotion is enabled. */
  userInfo?: UserInfoService;
  /** Present only when `kong.promotion.enabled` is true. */
  promotionStore?: PromotionStore;
  gitlabClient?: GitlabClient;
}): Promise<express.Router> {
  const router = Router();
  router.use(express.json());

  async function authorize(req: express.Request, permission: BasicPermission) {
    const credentials = await httpAuth.credentials(req);
    const decision = await permissions.authorize(
      [{ permission }],
      { credentials },
    );
    if (decision[0].result !== AuthorizeResult.ALLOW) {
      throw new NotAllowedError('Permission denied');
    }
  }

  // --- Promotion helpers (design 02 / plan P3) ---

  async function findRoutePlugin(
    instance: string,
    routeId: string,
    pluginId: string,
  ): Promise<AssociatedPluginsResponse | undefined> {
    const plugins = await kongService.getRouteAssociatedPlugins(instance, routeId);
    return plugins.find(p => p.id === pluginId);
  }

  /**
   * Blocks edits to a route plugin that has an open promotion (design 02,
   * "Freeze semantics"). A plugin type with no adapter is never promotable,
   * so it's never frozen; a plugin the freeze check can't find (already
   * gone) has nothing left to protect.
   */
  async function assertNotFrozen(instance: string, routeId: string, pluginId: string): Promise<void> {
    if (!promotionStore) return;

    const plugin = await findRoutePlugin(instance, routeId, pluginId);
    if (!plugin) return;
    const adapter = getAdapter(plugin.name);
    if (!adapter) return;

    const active = await promotionStore.getActiveByRoute(instance, routeId, adapter.pluginType);
    if (active) {
      const link = active.mr_ref ? ` (${active.mr_ref})` : '';
      throw new ConflictError(
        `Route plugin '${plugin.name}' on route '${routeId}' has an open promotion${link} — edits are frozen until it merges, fails, or is discarded.`,
      );
    }
  }

  async function requesterRef(req: express.Request): Promise<string> {
    if (!userInfo) return 'user:default/unknown';
    const credentials = await httpAuth.credentials(req, { allow: ['user'] });
    const info = await userInfo.getUserInfo(credentials);
    return info.userEntityRef;
  }

  // --- Validation schemas ---

  const instanceServiceParams = z.object({
    instance: z.string(),
    serviceName: z.string(),
  });

  const instanceServiceRouteParams = z.object({
    instance: z.string(),
    serviceName: z.string(),
    routeId: z.string(),
  });

  const instanceServicePluginParams = z.object({
    instance: z.string(),
    serviceName: z.string(),
    pluginId: z.string(),
  });

  const instanceRouteParams = z.object({
    instance: z.string(),
    routeId: z.string(),
  });

  const instanceRoutePluginParams = z.object({
    instance: z.string(),
    routeId: z.string(),
    pluginId: z.string(),
  });

  const instanceServiceRoutePluginParams = z.object({
    instance: z.string(),
    serviceName: z.string(),
    routeId: z.string(),
    pluginId: z.string(),
  });

  const promoteBody = z.object({
    /** Backstage entity ref of the service owning the plugin's route — resolves the target repo via its GitLab annotations. */
    entityRef: z.string(),
  });

  const createRouteBody = z.object({
    name: z.string().optional(),
    protocols: z.array(z.string()).optional(),
    methods: z.array(z.string()).optional(),
    hosts: z.array(z.string()).optional(),
    paths: z.array(z.string()).optional(),
    headers: z.record(z.array(z.string())).optional(),
    https_redirect_status_code: z.number().optional(),
    regex_priority: z.number().optional(),
    strip_path: z.boolean().optional(),
    path_handling: z.string().optional(),
    preserve_host: z.boolean().optional(),
    request_buffering: z.boolean().optional(),
    response_buffering: z.boolean().optional(),
    tags: z.array(z.string()).optional(),
  });

  const createPluginBody = z.object({
    name: z.string(),
    config: z.record(z.unknown()).optional(),
    enabled: z.boolean().optional(),
    protocols: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
  });

  const editPluginBody = z.object({
    name: z.string().optional(),
    config: z.record(z.unknown()).optional(),
    enabled: z.boolean().optional(),
    protocols: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
  });

  // --- Health check ---

  router.get('/health', async (_req, res) => {
    res.json({ status: 'ok' });
  });

  // --- Instances ---

  router.get('/instances', async (req, res) => {
    await authorize(req, kongInstancesReadPermission);
    res.json(kongService.getInstances());
  });

  // --- Service routes (Phase 1) ---

  // GET /:instance/services/:serviceName
  router.get('/:instance/services/:serviceName', async (req, res) => {
    await authorize(req, kongServiceReadPermission);

    const parsed = instanceServiceParams.safeParse(req.params);
    if (!parsed.success) throw new InputError(parsed.error.toString());

    const result = await kongService.getServiceInfo(
      parsed.data.instance,
      parsed.data.serviceName,
    );
    res.json(result);
  });

  // GET /:instance/services/:serviceName/plugins/associated
  router.get(
    '/:instance/services/:serviceName/plugins/associated',
    async (req, res) => {
      await authorize(req, kongPluginsReadPermission);

      const parsed = instanceServiceParams.safeParse(req.params);
      if (!parsed.success) throw new InputError(parsed.error.toString());

      const result = await kongService.getServiceAssociatedPlugins(
        parsed.data.instance,
        parsed.data.serviceName,
      );
      res.json(result);
    },
  );

  // GET /:instance/plugins
  router.get('/:instance/plugins', async (req, res) => {
    await authorize(req, kongPluginsReadPermission);

    const instance = z.string().safeParse(req.params.instance);
    if (!instance.success) throw new InputError(instance.error.toString());

    const result = await kongService.getAvailablePlugins(instance.data);
    res.json(result);
  });

  // --- Plugin schema introspection (Phase 2) ---

  // GET /:instance/services/plugins/:pluginName/fields
  router.get(
    '/:instance/services/plugins/:pluginName/fields',
    async (req, res) => {
      await authorize(req, kongPluginsReadPermission);

      const parsed = z
        .object({ instance: z.string(), pluginName: z.string() })
        .safeParse(req.params);
      if (!parsed.success) throw new InputError(parsed.error.toString());

      const result = await kongService.getPluginFields(
        parsed.data.instance,
        parsed.data.pluginName,
      );
      res.json(result);
    },
  );

  // --- Service plugin CRUD (Phase 2) ---

  // POST /:instance/services/:serviceName/plugins
  router.post(
    '/:instance/services/:serviceName/plugins',
    async (req, res) => {
      await authorize(req, kongApplyPluginServicePermission);

      const params = instanceServiceParams.safeParse(req.params);
      if (!params.success) throw new InputError(params.error.toString());

      const body = createPluginBody.safeParse(req.body);
      if (!body.success) throw new InputError(body.error.toString());

      const result = await kongService.addPluginToService(
        params.data.instance,
        params.data.serviceName,
        body.data,
      );
      res.status(201).json(result);
    },
  );

  // PATCH /:instance/services/:serviceName/plugins/:pluginId
  router.patch(
    '/:instance/services/:serviceName/plugins/:pluginId',
    async (req, res) => {
      await authorize(req, kongUpdateServicePluginPermission);

      const params = instanceServicePluginParams.safeParse(req.params);
      if (!params.success) throw new InputError(params.error.toString());

      const body = editPluginBody.safeParse(req.body);
      if (!body.success) throw new InputError(body.error.toString());

      const result = await kongService.editServicePlugin(
        params.data.instance,
        params.data.serviceName,
        params.data.pluginId,
        body.data,
      );
      res.json(result);
    },
  );

  // DELETE /:instance/services/:serviceName/plugins/:pluginId
  router.delete(
    '/:instance/services/:serviceName/plugins/:pluginId',
    async (req, res) => {
      await authorize(req, kongDisableServicePluginPermission);

      const params = instanceServicePluginParams.safeParse(req.params);
      if (!params.success) throw new InputError(params.error.toString());

      await kongService.removeServicePlugin(
        params.data.instance,
        params.data.serviceName,
        params.data.pluginId,
      );
      res.status(204).end();
    },
  );

  // --- Route CRUD (Phase 3) ---

  // GET /:instance/services/:serviceName/routes
  router.get(
    '/:instance/services/:serviceName/routes',
    async (req, res) => {
      await authorize(req, kongRoutesReadPermission);

      const parsed = instanceServiceParams.safeParse(req.params);
      if (!parsed.success) throw new InputError(parsed.error.toString());

      const result = await kongService.getRoutes(
        parsed.data.instance,
        parsed.data.serviceName,
      );
      res.json(result);
    },
  );

  // GET /:instance/services/:serviceName/routes/:routeId
  router.get(
    '/:instance/services/:serviceName/routes/:routeId',
    async (req, res) => {
      await authorize(req, kongRoutesReadPermission);

      const parsed = instanceServiceRouteParams.safeParse(req.params);
      if (!parsed.success) throw new InputError(parsed.error.toString());

      const result = await kongService.getRouteById(
        parsed.data.instance,
        parsed.data.serviceName,
        parsed.data.routeId,
      );
      res.json(result);
    },
  );

  // POST /:instance/services/:serviceName/routes
  router.post(
    '/:instance/services/:serviceName/routes',
    async (req, res) => {
      await authorize(req, kongRouteCreatePermission);

      const params = instanceServiceParams.safeParse(req.params);
      if (!params.success) throw new InputError(params.error.toString());

      const body = createRouteBody.safeParse(req.body);
      if (!body.success) throw new InputError(body.error.toString());

      const result = await kongService.createRoute(
        params.data.instance,
        params.data.serviceName,
        body.data as CreateRoute,
      );
      res.status(201).json(result);
    },
  );

  // PATCH /:instance/services/:serviceName/routes/:routeId
  router.patch(
    '/:instance/services/:serviceName/routes/:routeId',
    async (req, res) => {
      await authorize(req, kongRouteUpdatePermission);

      const params = instanceServiceRouteParams.safeParse(req.params);
      if (!params.success) throw new InputError(params.error.toString());

      const body = createRouteBody.partial().safeParse(req.body);
      if (!body.success) throw new InputError(body.error.toString());

      const result = await kongService.editRoute(
        params.data.instance,
        params.data.serviceName,
        params.data.routeId,
        body.data as Partial<CreateRoute>,
      );
      res.json(result);
    },
  );

  // DELETE /:instance/services/:serviceName/routes/:routeId
  router.delete(
    '/:instance/services/:serviceName/routes/:routeId',
    async (req, res) => {
      await authorize(req, kongRouteDeletePermission);

      const params = instanceServiceRouteParams.safeParse(req.params);
      if (!params.success) throw new InputError(params.error.toString());

      await kongService.removeRoute(
        params.data.instance,
        params.data.serviceName,
        params.data.routeId,
      );
      res.status(204).end();
    },
  );

  // --- Route plugin CRUD (Phase 4) ---

  // GET /:instance/routes/:routeId/plugins/associated
  router.get(
    '/:instance/routes/:routeId/plugins/associated',
    async (req, res) => {
      await authorize(req, kongPluginsReadPermission);

      const parsed = instanceRouteParams.safeParse(req.params);
      if (!parsed.success) throw new InputError(parsed.error.toString());

      const result = await kongService.getRouteAssociatedPlugins(
        parsed.data.instance,
        parsed.data.routeId,
      );
      res.json(result);
    },
  );

  // POST /:instance/routes/:routeId/plugins
  router.post('/:instance/routes/:routeId/plugins', async (req, res) => {
    await authorize(req, kongApplyPluginRoutePermission);

    const params = instanceRouteParams.safeParse(req.params);
    if (!params.success) throw new InputError(params.error.toString());

    const body = createPluginBody.safeParse(req.body);
    if (!body.success) throw new InputError(body.error.toString());

    const result = await kongService.addPluginToRoute(
      params.data.instance,
      params.data.routeId,
      body.data,
    );
    res.status(201).json(result);
  });

  // PATCH /:instance/routes/:routeId/plugins/:pluginId
  router.patch(
    '/:instance/routes/:routeId/plugins/:pluginId',
    async (req, res) => {
      await authorize(req, kongUpdateRoutePluginPermission);

      const params = instanceRoutePluginParams.safeParse(req.params);
      if (!params.success) throw new InputError(params.error.toString());

      const body = editPluginBody.safeParse(req.body);
      if (!body.success) throw new InputError(body.error.toString());

      await assertNotFrozen(params.data.instance, params.data.routeId, params.data.pluginId);

      const result = await kongService.editRoutePlugin(
        params.data.instance,
        params.data.routeId,
        params.data.pluginId,
        body.data,
      );
      res.json(result);
    },
  );

  // DELETE /:instance/routes/:routeId/plugins/:pluginId
  router.delete(
    '/:instance/routes/:routeId/plugins/:pluginId',
    async (req, res) => {
      await authorize(req, kongDisableRoutePluginPermission);

      const params = instanceRoutePluginParams.safeParse(req.params);
      if (!params.success) throw new InputError(params.error.toString());

      await assertNotFrozen(params.data.instance, params.data.routeId, params.data.pluginId);

      await kongService.removeRoutePlugin(
        params.data.instance,
        params.data.routeId,
        params.data.pluginId,
      );
      res.status(204).end();
    },
  );

  // --- Promote to code (Task P3, design 02) ---

  // POST /:instance/services/:serviceName/routes/:routeId/plugins/:pluginId/promote
  router.post(
    '/:instance/services/:serviceName/routes/:routeId/plugins/:pluginId/promote',
    async (req, res) => {
      await authorize(req, kongPluginPromotePermission);

      if (!promotionStore || !gitlabClient) {
        throw new ConflictError('Kong plugin promotion is not enabled on this instance');
      }

      const params = instanceServiceRoutePluginParams.safeParse(req.params);
      if (!params.success) throw new InputError(params.error.toString());
      const body = promoteBody.safeParse(req.body);
      if (!body.success) throw new InputError(body.error.toString());

      const { instance, serviceName, routeId, pluginId } = params.data;
      const { entityRef } = body.data;

      const plugin = await findRoutePlugin(instance, routeId, pluginId);
      if (!plugin) {
        throw new NotFoundError(`Route plugin '${pluginId}' not found on route '${routeId}'`);
      }

      const adapter = getAdapter(plugin.name);
      if (!adapter) {
        throw new InputError(
          `Plugin type '${plugin.name}' has no promotion adapter and cannot be promoted to code`,
        );
      }

      // Step 1: persist the draft before any external write (crash-safety —
      // an in-flight record for this route plugin means a retry resumes it
      // instead of starting a second attempt).
      let promotion = await promotionStore.getActiveByRoute(instance, routeId, adapter.pluginType);
      if (!promotion) {
        promotion = await promotionStore.upsertDraft({
          idempotencyKey: randomUUID(),
          instance,
          serviceName,
          routeId,
          pluginType: adapter.pluginType,
          configSnapshot: adapter.fromRendered({ config: plugin.config }),
          requesterRef: await requesterRef(req),
        });
      }
      const snapshot = promotion.config_snapshot as NormalizedConfig;

      // Step 2: generate + render-check (safe to redo on retry — pure function of the snapshot).
      const credentials = await httpAuth.credentials(req, { allow: ['user'] });
      const repo = await gitlabClient.resolveRepo(entityRef, credentials);
      const edits = adapter.toChartEdits(snapshot);
      const { dir, cleanup } = await gitlabClient.materializeChart(repo, repo.defaultBranch);

      try {
        const check = await renderCheck({ repoDir: dir, adapter, edits, liveConfig: snapshot });
        if (!check.equal) {
          throw new ConflictError(
            `Generated chart does not reproduce the live config for '${adapter.pluginType}': ${check.diff}`,
          );
        }

        // Step 3: branch/commit/MR (idempotent — reuses a branch/MR left by a crashed prior attempt).
        // create-vs-update is decided against the PROMOTION branch, not the
        // default-branch copy `dir` was materialized from: a crash-retry (or
        // a promote right after a discard, which doesn't delete the branch)
        // can find the branch already carrying a prior commit, and sending
        // `create` for a file that already exists there is a GitLab 400.
        const branch = `kong-promote/${adapter.pluginType}`;
        await gitlabClient.ensureBranch(repo, branch);
        const existing = await gitlabClient.pathsExistingOnRef(repo, branch, edits.map(e => e.path));
        await gitlabClient.commitEdits(
          repo,
          branch,
          dir,
          edits,
          existing,
          `kong: promote ${adapter.pluginType} on route ${routeId} to code`,
        );

        let mr = await gitlabClient.findOpenMergeRequest(repo, branch);
        if (!mr) {
          mr = await gitlabClient.openMergeRequest(
            repo,
            branch,
            `Promote Kong plugin '${adapter.pluginType}' to code`,
            [
              `Promotes the experimental \`${adapter.pluginType}\` plugin on route \`${routeId}\` `,
              `(service \`${serviceName}\`, Kong instance \`${instance}\`) from ClickOps to the chart.`,
              '',
              'Generated by the DevPortal Kong plugin promotion flow. Once this merges and deploys, ',
              'the portal verifies the code-owned plugin converges to the same config before removing ',
              'the experimental one.',
            ].join('\n'),
          );
        }

        // Step 4: record mr-open with mr_ref.
        await promotionStore.transition(promotion.id, 'mr-open', {
          mrRef: mr.webUrl,
          detail: encodeMrDetail({ host: repo.host, projectSlug: repo.projectSlug, projectId: mr.projectId, iid: mr.iid }),
        });

        // Step 5: tag the experimental entity.
        const tag = `promotion-pending:${mr.projectId}-${mr.iid}`;
        const existingTags = plugin.tags ?? [];
        if (!existingTags.includes(tag)) {
          await kongService.editRoutePlugin(instance, routeId, pluginId, {
            tags: [...existingTags, tag],
          });
        }

        res.status(201).json(
          toPromotionDto({ ...promotion, state: 'mr-open', mr_ref: mr.webUrl }),
        );
      } finally {
        await cleanup();
      }
    },
  );

  // DELETE /:instance/services/:serviceName/routes/:routeId/plugins/:pluginId/promote
  router.delete(
    '/:instance/services/:serviceName/routes/:routeId/plugins/:pluginId/promote',
    async (req, res) => {
      await authorize(req, kongPluginPromotePermission);

      if (!promotionStore) {
        throw new ConflictError('Kong plugin promotion is not enabled on this instance');
      }

      const params = instanceServiceRoutePluginParams.safeParse(req.params);
      if (!params.success) throw new InputError(params.error.toString());
      const { instance, routeId, pluginId } = params.data;

      const plugin = await findRoutePlugin(instance, routeId, pluginId);
      const adapter = plugin ? getAdapter(plugin.name) : undefined;
      if (!adapter) {
        throw new NotFoundError(`No promotable plugin '${pluginId}' found on route '${routeId}'`);
      }

      const active = await promotionStore.getActiveByRoute(instance, routeId, adapter.pluginType);
      if (!active) {
        throw new NotFoundError(`No open promotion for plugin '${pluginId}' on route '${routeId}'`);
      }

      if (active.mr_ref) {
        const mrDetail = decodeMrDetail(active.detail);
        if (gitlabClient && mrDetail) {
          await gitlabClient.closeMergeRequest(mrDetail, mrDetail.iid);
        }

        const currentTags = plugin?.tags ?? [];
        const filteredTags = currentTags.filter(t => !t.startsWith('promotion-pending:'));
        if (plugin && filteredTags.length !== currentTags.length) {
          await kongService.editRoutePlugin(instance, routeId, pluginId, { tags: filteredTags });
        }
      }

      await promotionStore.transition(active.id, 'discarded');
      res.status(204).end();
    },
  );

  // GET /:instance/services/:serviceName/routes/:routeId/plugins/:pluginId/promotions
  router.get(
    '/:instance/services/:serviceName/routes/:routeId/plugins/:pluginId/promotions',
    async (req, res) => {
      await authorize(req, kongPluginsReadPermission);

      if (!promotionStore) {
        res.json([]);
        return;
      }

      const params = instanceServiceRoutePluginParams.safeParse(req.params);
      if (!params.success) throw new InputError(params.error.toString());
      const { instance, routeId, pluginId } = params.data;

      const plugin = await findRoutePlugin(instance, routeId, pluginId);
      const adapter = plugin ? getAdapter(plugin.name) : undefined;
      if (!adapter) {
        res.json([]);
        return;
      }

      const rows = await promotionStore.listByRoute(instance, routeId, adapter.pluginType);
      res.json(rows.map(toPromotionDto));
    },
  );

  return router;
}
