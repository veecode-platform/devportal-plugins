import { randomUUID } from 'crypto';
import { isDeepStrictEqual } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { HttpAuthService, PermissionsService, UserInfoService } from '@backstage/backend-plugin-api';
import { ConflictError, InputError, NotAllowedError, NotFoundError, ServiceUnavailableError } from '@backstage/errors';
import { AuthorizeResult, type BasicPermission } from '@backstage/plugin-permission-common';
import { z } from 'zod';
import express from 'express';
import Router from 'express-promise-router';
import type {
  AssociatedPluginsResponse,
  CreateRoute,
  PromotionCapabilities,
  PromotionMode,
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
import { adapterRegistry, getAdapter } from './services/adapters';
import type { FileEdit, KongPluginAdapter, NormalizedConfig } from './services/adapters/types';
import { renderCheck, type EquivalenceResult } from './services/renderCheck';
import type { HelmCapabilityGate } from './services/helmCapability';
import { GitlabClient, type ResolvedRepo } from './services/GitlabClient';
import type { PromotionRecordRow, PromotionStore } from './services/promotionStore';
import { encodeMrDetail, decodeMrDetail } from './services/mrDetail';
import { EXPERIMENTAL_TAG_PREFIX, KIC_OWNERSHIP_TAG, promotionBranch } from './services/promotionTags';

/**
 * States whose `detail` column carries a human-readable failure message
 * rather than internal MR-coordinates JSON, and may therefore cross the API
 * boundary (ADR-016, extended by ADR-020 with `failed`).
 */
const FAILURE_STATES: ReadonlySet<PromotionState> = new Set<PromotionState>(['failed', 'failed-restored']);

interface PromotionDto {
  id: number;
  instance: string;
  serviceName: string;
  routeId: string;
  pluginType: string;
  state: PromotionState;
  mode: PromotionMode;
  mrRef: string | null;
  requesterRef: string;
  createdAt: string;
  updatedAt: string;
  /** Human-readable failure detail — only ever populated in a failure state (see `promotionFinalizer`). In every other state the column carries MR-coordinates JSON, which is internal bookkeeping and never reaches the client. */
  detail?: string;
}

/**
 * The promote MR description names the route it was generated for (see the
 * `openMergeRequest` call); an open MR on the shared per-type branch is ours
 * only when it names this route (ADR-022).
 */
export function mergeRequestBelongsToRoute(mr: { description?: string }, routeId: string): boolean {
  return (mr.description ?? '').includes(`\`${routeId}\``);
}

function toPromotionDto(row: PromotionRecordRow): PromotionDto {
  return {
    id: row.id,
    instance: row.instance,
    serviceName: row.service_name,
    routeId: row.route_id,
    pluginType: row.plugin_type,
    state: row.state,
    mode: row.mode,
    mrRef: row.mr_ref,
    requesterRef: row.requester_ref,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    detail: FAILURE_STATES.has(row.state) && row.detail ? row.detail : undefined,
  };
}

export async function createRouter({
  httpAuth,
  permissions,
  kongService,
  userInfo,
  promotionStore,
  gitlabClient,
  helmGate,
  helmPath = 'helm',
  helmTimeoutSeconds = 60,
  editInCodeEnabled = false,
}: {
  httpAuth: HttpAuthService;
  permissions: PermissionsService;
  kongService: KongServiceManagerService;
  /** Requester identity for promotion audit records — only needed when promotion is enabled. */
  userInfo?: UserInfoService;
  /** Present only when `kong.promotion.enabled` is true. */
  promotionStore?: PromotionStore;
  gitlabClient?: GitlabClient;
  /**
   * Gates preview/promote on the startup helm probe, re-probing lazily while
   * unavailable (ADR-018). Absent in tests that don't care about the helm
   * prerequisite — preview/promote then proceed ungated, same as before this
   * was added.
   */
  helmGate?: HelmCapabilityGate;
  /** `kong.promotion.helmPath` — also the path reported by `GET .../promotion/capabilities` when `helmGate` is absent. @default 'helm' */
  helmPath?: string;
  /** `kong.promotion.helmTimeoutSeconds`, forwarded to `renderCheck`. @default 60 */
  helmTimeoutSeconds?: number;
  /**
   * `kong.promotion.editInCode` (issue #135) — whether a code-owned
   * (KIC-managed) route plugin can be promoted directly from an edited
   * config, with no experiment ever created in Kong (mode `code-only`).
   * @default false
   */
  editInCodeEnabled?: boolean;
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

  type PluginOwnership = 'portal-managed' | 'code-owned';

  /**
   * Looks up a route plugin and its promotion adapter together — the same
   * 404 (plugin not found) / 400 (no adapter registered) gate that both
   * promote and preview require before doing anything else, plus its
   * ownership (ADR-017) so each caller can decide what a code-owned plugin
   * means for it (refuse, or accept an edit-in-code — issue #135).
   *
   * Ownership: promotion only applies to plugins the portal itself created.
   * When the instance configures `defaultTags`, those tags are the portal's
   * marker (`KongServiceManagerService.tagsForCreate`) — a plugin missing
   * any of them was never portal-created (e.g. reconciled onto Kong by the
   * Kong Ingress Controller from the service's chart). An instance with no
   * `defaultTags` configured has no ownership signal at all, so every
   * plugin is treated as portal-managed (today's behaviour, unchanged) —
   * and `editInCode` can never fire there, since it has nothing to key on.
   */
  async function resolvePromotableRoutePlugin(
    instance: string,
    routeId: string,
    pluginId: string,
  ): Promise<{ plugin: AssociatedPluginsResponse; adapter: KongPluginAdapter; ownership: PluginOwnership }> {
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

    const defaultTags = kongService.getInstanceDefaultTags(instance);
    let ownership: PluginOwnership = 'portal-managed';
    if (defaultTags && defaultTags.length > 0) {
      const tags = plugin.tags ?? [];
      const isPortalManaged = defaultTags.every(tag => tags.includes(tag));
      ownership = isPortalManaged ? 'portal-managed' : 'code-owned';
    }

    return { plugin, adapter, ownership };
  }

  /** Verbatim message the code-owned gate has always thrown (400) — kept identical for callers that don't (or can't) accept an edit-in-code config. */
  function codeOwnedError(pluginName: string, routeId: string): InputError {
    return new InputError(
      `Plugin '${pluginName}' on route '${routeId}' is not portal-managed (code-owned); promotion applies to experiments created from the portal`,
    );
  }

  /**
   * Decides which of the two promotion modes a request maps to (issue #135)
   * — shared by promote and preview so both apply the same four outcomes:
   * portal-managed + config → 400 (a portal-managed plugin's config always
   * comes from Kong); code-owned + editInCode + config → `code-only`;
   * code-owned without either → the pre-existing 400, verbatim.
   */
  function resolvePromotionMode(
    ownership: PluginOwnership,
    config: Record<string, unknown> | undefined,
    pluginName: string,
    routeId: string,
    pluginTags: string[] = [],
  ): PromotionMode {
    if (ownership === 'portal-managed') {
      if (config !== undefined) {
        throw new InputError(
          `Plugin '${pluginName}' on route '${routeId}' is portal-managed; its config comes from Kong and does not accept an edited 'config'`,
        );
      }
      return 'experiment';
    }
    if (!editInCodeEnabled || config === undefined) {
      throw codeOwnedError(pluginName, routeId);
    }
    // The finalizer only ever recognizes convergence on a plugin carrying the
    // Kong Ingress Controller's ownership tag (`handleApplying`). "Not
    // portal-managed" is a wider set than that — a plugin created straight
    // through the Admin API matches it too — and offering edit-in-code for one
    // of those opens a merge request the finalizer can never finish, leaving
    // the record to time out in `failed`. Gate on the same signal the
    // finalizer reads.
    if (!pluginTags.includes(KIC_OWNERSHIP_TAG)) {
      throw new InputError(
        `Plugin '${pluginName}' on route '${routeId}' is not managed by the Kong Ingress Controller ` +
          `(no '${KIC_OWNERSHIP_TAG}' tag), so an edit in code could never be reconciled back onto the ` +
          `gateway; edit it wherever it is currently managed`,
      );
    }
    return 'code-only';
  }

  /**
   * Materializes the chart at the repo's default branch and runs the
   * generation-time equivalence check against it (design 02, promotion
   * mechanics step 3) — shared by promote (which aborts the write on a
   * mismatch) and preview (which surfaces the mismatch without ever
   * writing). Caller owns `cleanup()` and decides what a mismatch means.
   */
  async function materializeAndCheck(
    client: GitlabClient,
    repo: ResolvedRepo,
    adapter: KongPluginAdapter,
    edits: FileEdit[],
    liveConfig: NormalizedConfig,
  ): Promise<{ dir: string; cleanup: () => Promise<void>; check: EquivalenceResult }> {
    const { dir, cleanup } = await client.materializeChart(repo, repo.defaultBranch);
    const check = await renderCheck({ repoDir: dir, adapter, edits, liveConfig, helmPath, helmTimeoutSeconds });
    return { dir, cleanup, check };
  }

  /**
   * Gates preview/promote on the startup helm capability probe (helm is a
   * declared deployment prerequisite — ADR-018): 503 with an actionable
   * message instead of letting `renderCheck` fail deep inside with a raw
   * ENOENT. No-op when `helmGate` wasn't wired (promotion disabled, or a
   * caller that doesn't care about the prerequisite).
   */
  async function assertHelmAvailable(): Promise<void> {
    if (!helmGate) return;
    const capability = await helmGate.getCapability();
    if (!capability.available) {
      throw new ServiceUnavailableError(capability.error);
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
    /**
     * Edited config (issue #135, "edit in code") — accepted only when the
     * target plugin is code-owned and `kong.promotion.editInCode` is on;
     * a portal-managed plugin's config always comes from Kong itself and
     * rejects this field.
     */
    config: z.record(z.unknown()).optional(),
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

  // --- Promotion capabilities (helm-prerequisite follow-up, ADR-018) ---

  // GET /:instance/promotion/capabilities
  router.get('/:instance/promotion/capabilities', async (req, res) => {
    await authorize(req, kongPluginsReadPermission);

    const parsed = z.object({ instance: z.string() }).safeParse(req.params);
    if (!parsed.success) throw new InputError(parsed.error.toString());

    const adapters = Object.keys(adapterRegistry).sort();
    if (!helmGate) {
      const capabilities: PromotionCapabilities = {
        helm: {
          available: false,
          path: helmPath,
          error: 'Kong plugin promotion is not enabled on this instance',
        },
        editInCode: false,
        adapters,
      };
      res.json(capabilities);
      return;
    }

    const capabilities: PromotionCapabilities = {
      helm: await helmGate.getCapability(),
      editInCode: editInCodeEnabled,
      adapters,
    };
    res.json(capabilities);
  });

  // --- Promote to code (Task P3, design 02) ---

  // POST /:instance/services/:serviceName/routes/:routeId/plugins/:pluginId/promote
  router.post(
    '/:instance/services/:serviceName/routes/:routeId/plugins/:pluginId/promote',
    async (req, res) => {
      await authorize(req, kongPluginPromotePermission);

      if (!promotionStore || !gitlabClient) {
        throw new ConflictError('Kong plugin promotion is not enabled on this instance');
      }
      await assertHelmAvailable();

      const params = instanceServiceRoutePluginParams.safeParse(req.params);
      if (!params.success) throw new InputError(params.error.toString());
      const body = promoteBody.safeParse(req.body);
      if (!body.success) throw new InputError(body.error.toString());

      const { instance, serviceName, routeId, pluginId } = params.data;
      const { entityRef, config: editedConfigInput } = body.data;

      const { plugin, adapter, ownership } = await resolvePromotableRoutePlugin(instance, routeId, pluginId);
      const mode = resolvePromotionMode(ownership, editedConfigInput, plugin.name, routeId, plugin.tags ?? []);

      const activeBeforeStart = await promotionStore.getActiveByRoute(instance, routeId, adapter.pluginType);

      let promotion: PromotionRecordRow;
      if (mode === 'code-only') {
        // Edit-in-code never resumes an active record (ADR-024): resuming a
        // crashed draft could take the wrong Step-4 branch (experiment vs.
        // code-only) or silently discard the config the user just edited in
        // favor of a stale snapshot. An active record for this route/type —
        // of either mode — is always a conflict, same wording family as
        // `assertNotFrozen`.
        if (activeBeforeStart) {
          const link = activeBeforeStart.mr_ref ? ` (${activeBeforeStart.mr_ref})` : '';
          throw new ConflictError(
            `Route plugin '${plugin.name}' on route '${routeId}' has an open promotion${link} — edits are frozen until it merges, fails, or is discarded.`,
          );
        }

        const editedSnapshot = adapter.fromRendered({ config: editedConfigInput! });
        const liveSnapshot = adapter.fromRendered({ config: plugin.config });
        if (isDeepStrictEqual(editedSnapshot, liveSnapshot)) {
          throw new ConflictError(
            `Edited config for '${adapter.pluginType}' on route '${routeId}' is identical to the live config — nothing to promote`,
          );
        }

        promotion = await promotionStore.upsertDraft({
          idempotencyKey: randomUUID(),
          instance,
          serviceName,
          routeId,
          pluginType: adapter.pluginType,
          configSnapshot: editedSnapshot,
          requesterRef: await requesterRef(req),
          mode: 'code-only',
        });
      } else {
        // Step 1 (experiment, unchanged): persist the draft before any
        // external write — a retry resumes the same in-flight record
        // instead of starting a second attempt.
        promotion =
          activeBeforeStart ??
          (await promotionStore.upsertDraft({
            idempotencyKey: randomUUID(),
            instance,
            serviceName,
            routeId,
            pluginType: adapter.pluginType,
            configSnapshot: adapter.fromRendered({ config: plugin.config }),
            requesterRef: await requesterRef(req),
            mode: 'experiment',
          }));
      }
      const snapshot = promotion.config_snapshot as NormalizedConfig;

      // Step 2: generate + render-check (safe to redo on retry — pure function of the snapshot).
      const credentials = await httpAuth.credentials(req, { allow: ['user'] });
      const repo = await gitlabClient.resolveRepo(entityRef, credentials);

      // Persist the repo coordinates on the still-draft record before the MR
      // exists (P4 handoff note 1): a crash between the MR actually being
      // created below and the `mr-open` transition would otherwise leave a
      // `draft` row with no way to find the orphaned MR. `iid` is filled in
      // once the MR is open.
      await promotionStore.transition(promotion.id, 'draft', {
        detail: encodeMrDetail({ host: repo.host, projectSlug: repo.projectSlug, projectId: repo.projectId }),
      });

      const edits = adapter.toChartEdits(snapshot);
      const { dir, cleanup, check } = await materializeAndCheck(gitlabClient, repo, adapter, edits, snapshot);

      try {
        if (!check.equal) {
          throw new ConflictError(
            `Generated chart does not reproduce the live config for '${adapter.pluginType}': ${check.diff}`,
          );
        }

        // Step 3: branch/commit/MR (idempotent — reuses a branch/MR left by a crashed prior attempt).
        // The branch is reused ONLY while an MR is open for it (crash-retry
        // between "MR opened" and "record transitioned"). Otherwise it is a
        // leftover — GitLab does not always honour remove_source_branch on
        // merge, and a discard closes the MR without touching the branch — and
        // committing on top of it produced an MR 12 commits behind main with
        // conflicts (ADR-022). Recreate it from the default branch instead.
        // create-vs-update is decided against the PROMOTION branch, not the
        // default-branch copy `dir` was materialized from: a crash-retry can
        // find the branch already carrying a prior commit, and sending
        // `create` for a file that already exists there is a GitLab 400.
        const branch = promotionBranch(adapter.pluginType);
        let mr = await gitlabClient.findOpenMergeRequest(repo, branch);
        if (mr && !mergeRequestBelongsToRoute(mr, routeId)) {
          // The branch is per plugin type per repo, so a second route of the
          // same repo promoting the same type would land its commit on the
          // other route's open MR. Refuse instead (ADR-022 ownership guard).
          throw new ConflictError(
            `Another promotion of '${adapter.pluginType}' is open in this repository (${mr.webUrl}); merge or close it first`,
          );
        }
        if (!mr) {
          await gitlabClient.deleteBranch(repo, branch);
        }
        await gitlabClient.ensureBranch(repo, branch);
        const existing = await gitlabClient.pathsExistingOnRef(repo, branch, edits.map(e => e.path));
        await gitlabClient.commitEdits(
          repo,
          branch,
          dir,
          edits,
          existing,
          mode === 'code-only'
            ? `kong: edit ${adapter.pluginType} on route ${routeId} in code`
            : `kong: promote ${adapter.pluginType} on route ${routeId} to code`,
        );

        if (!mr) {
          mr = await gitlabClient.openMergeRequest(
            repo,
            branch,
            mode === 'code-only'
              ? `Edit Kong plugin '${adapter.pluginType}' in code`
              : `Promote Kong plugin '${adapter.pluginType}' to code`,
            mode === 'code-only'
              ? [
                  `Edits the code-owned \`${adapter.pluginType}\` plugin on route \`${routeId}\` `,
                  `(service \`${serviceName}\`, Kong instance \`${instance}\`) directly in the chart.`,
                  '',
                  'Generated by the DevPortal Kong plugin "edit in code" flow. This plugin is already ',
                  'managed by the Kong Ingress Controller from the chart — there is no experiment to ',
                  'remove.',
                ].join('\n')
              : [
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

        // Step 5: tag the experimental entity — skipped for `code-only`
        // (issue #135): there is no experiment in Kong to mark, freeze, or
        // later remove; the plugin being edited is already code-owned.
        if (mode === 'experiment') {
          const tag = `${EXPERIMENTAL_TAG_PREFIX}${mr.projectId}-${mr.iid}`;
          const existingTags = plugin.tags ?? [];
          if (!existingTags.includes(tag)) {
            await kongService.editRoutePlugin(instance, routeId, pluginId, {
              tags: [...existingTags, tag],
            });
          }
        }

        res.status(201).json(
          toPromotionDto({ ...promotion, state: 'mr-open', mr_ref: mr.webUrl }),
        );
      } finally {
        await cleanup();
      }
    },
  );

  // POST /:instance/services/:serviceName/routes/:routeId/plugins/:pluginId/promote/preview
  router.post(
    '/:instance/services/:serviceName/routes/:routeId/plugins/:pluginId/promote/preview',
    async (req, res) => {
      await authorize(req, kongPluginPromotePermission);

      if (!promotionStore || !gitlabClient) {
        throw new ConflictError('Kong plugin promotion is not enabled on this instance');
      }
      await assertHelmAvailable();

      const params = instanceServiceRoutePluginParams.safeParse(req.params);
      if (!params.success) throw new InputError(params.error.toString());
      const body = promoteBody.safeParse(req.body);
      if (!body.success) throw new InputError(body.error.toString());

      const { instance, routeId, pluginId } = params.data;
      const { entityRef, config: editedConfigInput } = body.data;

      const { plugin, adapter, ownership } = await resolvePromotableRoutePlugin(instance, routeId, pluginId);
      // Preview stays permissive on the equality check (unlike promote): it
      // shows the generated YAML for an edited config even when that config
      // happens to match the live one.
      resolvePromotionMode(ownership, editedConfigInput, plugin.name, routeId, plugin.tags ?? []);
      const previewConfig =
        editedConfigInput !== undefined
          ? adapter.fromRendered({ config: editedConfigInput })
          : adapter.fromRendered({ config: plugin.config });

      const credentials = await httpAuth.credentials(req, { allow: ['user'] });
      const repo = await gitlabClient.resolveRepo(entityRef, credentials);

      const edits = adapter.toChartEdits(previewConfig);
      const { dir, cleanup, check } = await materializeAndCheck(gitlabClient, repo, adapter, edits, previewConfig);

      try {
        if (!check.equal) {
          // Unlike promote, a preview has nothing in flight to conflict
          // with — a mismatch here just means the current live config
          // wouldn't reproduce from the chart yet, a client-facing 400.
          throw new InputError(
            `Generated chart does not reproduce the live config for '${adapter.pluginType}': ${check.diff}`,
          );
        }

        const files = await Promise.all(
          edits.map(async edit => ({
            path: edit.path,
            content: await fs.readFile(path.join(dir, edit.path), 'utf8'),
          })),
        );

        res.json({ files, normalizedConfig: previewConfig });
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
        // `mr_ref` is only ever set at the mr-open transition, which always
        // writes `iid` alongside it — this narrows the now-optional field
        // (P4 draft probe) back for the one caller that requires it.
        if (gitlabClient && mrDetail?.iid !== undefined) {
          await gitlabClient.closeMergeRequest(mrDetail, mrDetail.iid);
        }

        const currentTags = plugin?.tags ?? [];
        const filteredTags = currentTags.filter(t => !t.startsWith(EXPERIMENTAL_TAG_PREFIX));
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
