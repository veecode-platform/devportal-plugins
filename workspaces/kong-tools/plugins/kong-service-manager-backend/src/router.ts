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
import { ActivePromotionExistsError } from './services/promotionStore';
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
   * Edit-in-code (issue #135): the adapter only carries the fields its
   * `fromRendered` normalizes into the chart — a change to any other live
   * field would be dropped from the generated `values.yaml` silently, and for
   * an adapter like rate-limiting (which routes only `minute`) the render
   * check compares only that normalized view, so the promotion could still
   * finish `codified` without the user's edit. Reject such an edit loudly.
   * `fromRendered`'s own output keys are the single source of truth for what
   * the adapter can carry, so this never drifts from `toChartEdits`. Only
   * fields present in the live Kong config count as edits — the portal form
   * seeds schema defaults Kong may omit, and those are not user changes.
   */
  function assertEditableInCode(
    adapter: KongPluginAdapter,
    editedConfig: Record<string, unknown>,
    liveConfig: Record<string, unknown>,
  ): void {
    const editable = new Set(Object.keys(adapter.fromRendered({ config: editedConfig })));
    const changedUneditable = Object.keys(editedConfig).filter(
      key =>
        !editable.has(key) &&
        key in liveConfig &&
        !isDeepStrictEqual(editedConfig[key], liveConfig[key]),
    );
    if (changedUneditable.length > 0) {
      throw new InputError(
        `Editing ${changedUneditable.map(k => `'${k}'`).join(', ')} is not supported for ` +
          `'${adapter.pluginType}' in code — only ${[...editable].map(k => `'${k}'`).join(', ')} ` +
          `${editable.size === 1 ? 'is' : 'are'} carried into the chart from this plugin. ` +
          `Change the rest directly in the service's chart.`,
      );
    }
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
    ref: string,
    adapter: KongPluginAdapter,
    edits: FileEdit[],
    liveConfig: NormalizedConfig,
  ): Promise<{ dir: string; cleanup: () => Promise<void>; check: EquivalenceResult }> {
    // `ref` is a pinned commit SHA (F3), not the moving default-branch name, so
    // the render check and the promotion branch are cut from the same tree.
    const { dir, cleanup } = await client.materializeChart(repo, ref);
    const check = await renderCheck({ repoDir: dir, adapter, edits, liveConfig, helmPath, helmTimeoutSeconds });
    return { dir, cleanup, check };
  }

  /**
   * Delete-in-code (issue #3) safety gate mirroring `resolvePromotionMode`'s
   * code-owned branch: removing a plugin from the chart only applies to a
   * code-owned, Kong-Ingress-Controller-managed plugin. Portal-managed
   * (experimental) plugins stay on the gateway flow, and a code-owned plugin
   * the controller does not manage could never be observed to disappear, so
   * the finalizer could never confirm the removal.
   */
  function assertDeletableInCode(
    ownership: PluginOwnership,
    pluginName: string,
    routeId: string,
    pluginTags: string[],
  ): void {
    if (!editInCodeEnabled) {
      throw new InputError(
        `Removing a plugin from code is disabled on this instance (kong.promotion.editInCode)`,
      );
    }
    if (ownership === 'portal-managed') {
      throw new InputError(
        `Plugin '${pluginName}' on route '${routeId}' is portal-managed (experimental); ` +
          `remove it directly through the gateway instead of opening a merge request`,
      );
    }
    if (!pluginTags.includes(KIC_OWNERSHIP_TAG)) {
      throw new InputError(
        `Plugin '${pluginName}' on route '${routeId}' is not managed by the Kong Ingress Controller ` +
          `(no '${KIC_OWNERSHIP_TAG}' tag), so a removal from the chart could never be reconciled off the ` +
          `gateway; remove it wherever it is currently managed`,
      );
    }
  }

  /**
   * Proves the chart's generated template for this plugin type is still the
   * adapter's own output before a delete-in-code removes it (ADR-024: the
   * pipeline never clobbers a team-authored chart file). Returns the current
   * template content (for the removal preview) on success; throws a 400/409
   * naming the reason on any mismatch. `dir` is a materialized chart checkout.
   */
  async function assertRemovableTemplate(
    dir: string,
    adapter: KongPluginAdapter,
    routeId: string,
  ): Promise<{ path: string; content: string }> {
    const expected = adapter.expectedTemplate();
    let current: string;
    try {
      current = await fs.readFile(path.join(dir, expected.path), 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new ConflictError(
          `The chart does not declare '${adapter.pluginType}' via '${expected.path}', so there is nothing ` +
            `to remove for route '${routeId}'. It may already have been removed, or is defined elsewhere in the chart.`,
        );
      }
      throw err;
    }
    if (current !== expected.content) {
      throw new InputError(
        `The chart's '${expected.path}' was modified by hand and is no longer the portal-generated template ` +
          `for '${adapter.pluginType}'; removing it automatically could drop unrelated changes — remove it ` +
          `directly in the service's chart.`,
      );
    }
    return { path: expected.path, content: current };
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

  /** Delete-in-code (issue #3): only the owning entity ref — a removal carries no config. */
  const demoteBody = z.object({
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

        assertEditableInCode(adapter, editedConfigInput!, plugin.config);

        const editedSnapshot = adapter.fromRendered({ config: editedConfigInput! });
        const liveSnapshot = adapter.fromRendered({ config: plugin.config });
        if (isDeepStrictEqual(editedSnapshot, liveSnapshot)) {
          throw new ConflictError(
            `Edited config for '${adapter.pluginType}' on route '${routeId}' is identical to the live config — nothing to promote`,
          );
        }

        try {
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
        } catch (err) {
          // F4: a concurrent promote for the same route+plugin-type won the
          // active-per-route DB guard between the getActiveByRoute check above
          // and this insert. Same outcome as an already-open promotion — frozen.
          if (err instanceof ActivePromotionExistsError) {
            const link = err.active.mr_ref ? ` (${err.active.mr_ref})` : '';
            throw new ConflictError(
              `Route plugin '${plugin.name}' on route '${routeId}' has an open promotion${link} — edits are frozen until it merges, fails, or is discarded.`,
            );
          }
          throw err;
        }
      } else {
        // Step 1 (experiment): persist the draft before any external write — a
        // retry resumes the same in-flight record instead of starting a second
        // attempt.
        if (activeBeforeStart) {
          promotion = activeBeforeStart;
        } else {
          try {
            promotion = await promotionStore.upsertDraft({
              idempotencyKey: randomUUID(),
              instance,
              serviceName,
              routeId,
              pluginType: adapter.pluginType,
              configSnapshot: adapter.fromRendered({ config: plugin.config }),
              requesterRef: await requesterRef(req),
              mode: 'experiment',
            });
          } catch (err) {
            // F4: lost the active-per-route race to a concurrent promote of the
            // same route+plugin-type. Resume the winner instead of a 500 — an
            // experiment retry is meant to converge on the one in-flight record.
            if (err instanceof ActivePromotionExistsError) {
              promotion = err.active;
            } else {
              throw err;
            }
          }
        }
      }
      const snapshot = promotion.config_snapshot as NormalizedConfig;

      // Step 2: generate + render-check (safe to redo on retry — pure function of the snapshot).
      const credentials = await httpAuth.credentials(req, { allow: ['user'] });
      const repo = await gitlabClient.resolveRepo(entityRef, credentials);
      // F3: pin the default branch to a commit SHA once and use it for BOTH the
      // render-check materialization and the promotion branch's base, so a merge
      // landing on the default branch between the two never bases the branch on a
      // tree the render check never verified (TOCTOU).
      const baseSha = await gitlabClient.resolveRefSha(repo, repo.defaultBranch);

      // Persist the repo coordinates on the still-draft record before the MR
      // exists (P4 handoff note 1): a crash between the MR actually being
      // created below and the `mr-open` transition would otherwise leave a
      // `draft` row with no way to find the orphaned MR. `iid` is filled in
      // once the MR is open.
      await promotionStore.transition(promotion.id, 'draft', {
        detail: encodeMrDetail({ host: repo.host, projectSlug: repo.projectSlug, projectId: repo.projectId }),
      });

      // Edit-in-code (B1): a code-only promotion targets a plugin whose chart
      // file was authored by the service team, not the portal. Only touch
      // `values.yaml` (the `op:'merge'` edits) and never rewrite the template
      // (`op:'create'`), which would clobber the team's file — guard, labels,
      // hardcoded keys — or add a duplicate manifest. If the existing template
      // doesn't route the edited field through values, the render check below
      // won't reproduce the edited config and the promote is refused.
      const edits =
        mode === 'code-only'
          ? adapter.toChartEdits(snapshot).filter(e => e.op !== 'create')
          : adapter.toChartEdits(snapshot);
      const { dir, cleanup, check } = await materializeAndCheck(gitlabClient, repo, baseSha, adapter, edits, snapshot);

      try {
        if (!check.equal) {
          // F5 (issue: orphan draft): the draft was persisted before this check
          // (the `draft` transition above). A render-check mismatch is
          // deterministic — it will never converge on a retry — so leaving the
          // record in `draft` strands it: `draft` is an ACTIVE_PROMOTION_STATE,
          // and for a `code-only` edit the active-record guard would then refuse
          // every future promote of this route+plugin-type forever. Terminalize
          // it here (no MR and no Kong tag exist yet — nothing external to undo)
          // so the route frees up again. `failed` rather than `discarded`: it
          // keeps the record legible in history with the render diff in `detail`,
          // and for `code-only` still reads as code-owned + editable
          // (promotionBadge, ADR-021), so the next edit is offered normally.
          await promotionStore.transition(promotion.id, 'failed', { detail: check.diff });
          throw new ConflictError(
            mode === 'code-only'
              ? `The chart does not expose '${adapter.pluginType}' as an editable value on this route, so editing in code can't reproduce the requested config — edit the plugin directly in the service's chart. Detail: ${check.diff}`
              : `Generated chart does not reproduce the live config for '${adapter.pluginType}': ${check.diff}`,
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
        await gitlabClient.ensureBranch(repo, branch, baseSha);
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
      const mode = resolvePromotionMode(ownership, editedConfigInput, plugin.name, routeId, plugin.tags ?? []);
      if (mode === 'code-only' && editedConfigInput !== undefined) {
        // Same guard as promote: refuse a preview of an edit that changes a
        // field the adapter can't carry, so the review dialog shows why the
        // config is unsupported instead of a diff that silently omits it.
        assertEditableInCode(adapter, editedConfigInput, plugin.config);
      }
      const previewConfig =
        editedConfigInput !== undefined
          ? adapter.fromRendered({ config: editedConfigInput })
          : adapter.fromRendered({ config: plugin.config });

      const credentials = await httpAuth.credentials(req, { allow: ['user'] });
      const repo = await gitlabClient.resolveRepo(entityRef, credentials);
      // Pin the default branch to a SHA so the render check runs against a fixed
      // tree (F3) — a preview writes nothing, but this keeps its check consistent
      // with what promote would verify.
      const baseSha = await gitlabClient.resolveRefSha(repo, repo.defaultBranch);

      // Same edit-in-code rule as promote (B1): code-only never rewrites the
      // team's template, only the values it exposes.
      const edits =
        mode === 'code-only'
          ? adapter.toChartEdits(previewConfig).filter(e => e.op !== 'create')
          : adapter.toChartEdits(previewConfig);
      const { dir, cleanup, check } = await materializeAndCheck(gitlabClient, repo, baseSha, adapter, edits, previewConfig);

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

  // --- Delete to code / demote (issue #3, mirrors Promote to code) ---

  // POST /:instance/services/:serviceName/routes/:routeId/plugins/:pluginId/demote/preview
  router.post(
    '/:instance/services/:serviceName/routes/:routeId/plugins/:pluginId/demote/preview',
    async (req, res) => {
      await authorize(req, kongPluginPromotePermission);

      if (!promotionStore || !gitlabClient) {
        throw new ConflictError('Kong plugin promotion is not enabled on this instance');
      }
      await assertHelmAvailable();

      const params = instanceServiceRoutePluginParams.safeParse(req.params);
      if (!params.success) throw new InputError(params.error.toString());
      const body = demoteBody.safeParse(req.body);
      if (!body.success) throw new InputError(body.error.toString());

      const { instance, routeId, pluginId } = params.data;
      const { entityRef } = body.data;

      const { plugin, adapter, ownership } = await resolvePromotableRoutePlugin(instance, routeId, pluginId);
      assertDeletableInCode(ownership, plugin.name, routeId, plugin.tags ?? []);

      const credentials = await httpAuth.credentials(req, { allow: ['user'] });
      const repo = await gitlabClient.resolveRepo(entityRef, credentials);
      const baseSha = await gitlabClient.resolveRefSha(repo, repo.defaultBranch);

      const { dir, cleanup } = await gitlabClient.materializeChart(repo, baseSha);
      try {
        // Prove the file we would delete is still the portal's own template
        // (ADR-024) — read it BEFORE the render check below, which deletes it
        // from `dir`.
        const removed = await assertRemovableTemplate(dir, adapter, routeId);
        const check = await renderCheck({
          repoDir: dir,
          adapter,
          edits: adapter.toChartRemoval(),
          liveConfig: {},
          helmPath,
          helmTimeoutSeconds,
          expectAbsent: true,
        });
        if (!check.equal) {
          throw new InputError(
            `Removing '${adapter.pluginType}' from the chart would not fully remove it: ${check.diff}`,
          );
        }
        // `files` are what the merge request removes — the review dialog renders
        // them under a "will be removed" heading.
        res.json({ files: [removed], normalizedConfig: adapter.fromRendered({ config: plugin.config }) });
      } finally {
        await cleanup();
      }
    },
  );

  // POST /:instance/services/:serviceName/routes/:routeId/plugins/:pluginId/demote
  router.post(
    '/:instance/services/:serviceName/routes/:routeId/plugins/:pluginId/demote',
    async (req, res) => {
      await authorize(req, kongPluginPromotePermission);

      if (!promotionStore || !gitlabClient) {
        throw new ConflictError('Kong plugin promotion is not enabled on this instance');
      }
      await assertHelmAvailable();

      const params = instanceServiceRoutePluginParams.safeParse(req.params);
      if (!params.success) throw new InputError(params.error.toString());
      const body = demoteBody.safeParse(req.body);
      if (!body.success) throw new InputError(body.error.toString());

      const { instance, serviceName, routeId, pluginId } = params.data;
      const { entityRef } = body.data;

      const { plugin, adapter, ownership } = await resolvePromotableRoutePlugin(instance, routeId, pluginId);
      assertDeletableInCode(ownership, plugin.name, routeId, plugin.tags ?? []);

      // A delete never resumes an active record — any open promotion/edit/delete
      // for this route+type is a conflict, same wording family as edit-in-code.
      const active = await promotionStore.getActiveByRoute(instance, routeId, adapter.pluginType);
      if (active) {
        const link = active.mr_ref ? ` (${active.mr_ref})` : '';
        throw new ConflictError(
          `Route plugin '${plugin.name}' on route '${routeId}' has an open promotion${link} — ` +
            `it is frozen until that merges, fails, or is discarded.`,
        );
      }

      let promotion: PromotionRecordRow;
      try {
        promotion = await promotionStore.upsertDraft({
          idempotencyKey: randomUUID(),
          instance,
          serviceName,
          routeId,
          pluginType: adapter.pluginType,
          // The config being removed, recorded for the audit trail; the removal
          // itself is config-independent.
          configSnapshot: adapter.fromRendered({ config: plugin.config }),
          requesterRef: await requesterRef(req),
          mode: 'delete',
        });
      } catch (err) {
        if (err instanceof ActivePromotionExistsError) {
          const link = err.active.mr_ref ? ` (${err.active.mr_ref})` : '';
          throw new ConflictError(
            `Route plugin '${plugin.name}' on route '${routeId}' has an open promotion${link} — ` +
              `it is frozen until that merges, fails, or is discarded.`,
          );
        }
        throw err;
      }

      const credentials = await httpAuth.credentials(req, { allow: ['user'] });
      const repo = await gitlabClient.resolveRepo(entityRef, credentials);
      const baseSha = await gitlabClient.resolveRefSha(repo, repo.defaultBranch);
      await promotionStore.transition(promotion.id, 'draft', {
        detail: encodeMrDetail({ host: repo.host, projectSlug: repo.projectSlug, projectId: repo.projectId }),
      });

      const edits = adapter.toChartRemoval();
      const { dir, cleanup } = await gitlabClient.materializeChart(repo, baseSha);

      try {
        // Safety proof (ADR-024): read + compare the template BEFORE the render
        // check below deletes it from `dir`. Any failure terminalizes the draft
        // (nothing external written yet) so the route frees up again (F5).
        let removed: { path: string; content: string };
        try {
          removed = await assertRemovableTemplate(dir, adapter, routeId);
        } catch (err) {
          await promotionStore.transition(promotion.id, 'failed', {
            detail: err instanceof Error ? err.message : String(err),
          });
          throw err;
        }
        const check = await renderCheck({
          repoDir: dir,
          adapter,
          edits,
          liveConfig: {},
          helmPath,
          helmTimeoutSeconds,
          expectAbsent: true,
        });
        if (!check.equal) {
          await promotionStore.transition(promotion.id, 'failed', { detail: check.diff });
          throw new ConflictError(
            `Removing '${adapter.pluginType}' from the chart would not fully remove it: ${check.diff}`,
          );
        }

        // Branch/commit/MR — same branch convention and per-route ownership
        // guard as promote (the active-per-route index keeps a delete and a
        // promote of the same type+route from ever being in flight together).
        const branch = promotionBranch(adapter.pluginType);
        let mr = await gitlabClient.findOpenMergeRequest(repo, branch);
        if (mr && !mergeRequestBelongsToRoute(mr, routeId)) {
          throw new ConflictError(
            `Another promotion of '${adapter.pluginType}' is open in this repository (${mr.webUrl}); merge or close it first`,
          );
        }
        if (!mr) {
          await gitlabClient.deleteBranch(repo, branch);
        }
        await gitlabClient.ensureBranch(repo, branch, baseSha);
        const existing = await gitlabClient.pathsExistingOnRef(repo, branch, edits.map(e => e.path));
        await gitlabClient.commitEdits(
          repo,
          branch,
          dir,
          edits,
          existing,
          `kong: remove ${adapter.pluginType} on route ${routeId} from code`,
        );

        if (!mr) {
          mr = await gitlabClient.openMergeRequest(
            repo,
            branch,
            `Remove Kong plugin '${adapter.pluginType}' from code`,
            [
              `Removes the code-owned \`${adapter.pluginType}\` plugin on route \`${routeId}\` `,
              `(service \`${serviceName}\`, Kong instance \`${instance}\`) from the chart by deleting its `,
              `generated template (\`${removed.path}\`).`,
              '',
              'Generated by the DevPortal Kong plugin "remove from code" flow. Once this merges and deploys, ',
              'the portal verifies the plugin has been removed from the gateway by the Kong Ingress Controller.',
            ].join('\n'),
          );
        }

        await promotionStore.transition(promotion.id, 'mr-open', {
          mrRef: mr.webUrl,
          detail: encodeMrDetail({ host: repo.host, projectSlug: repo.projectSlug, projectId: mr.projectId, iid: mr.iid }),
        });

        res.status(201).json(toPromotionDto({ ...promotion, state: 'mr-open', mr_ref: mr.webUrl }));
      } finally {
        await cleanup();
      }
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
      // Delete-in-code removes the live plugin before the frontend's next
      // silent poll. Keep accepting the plugin type as a query hint so the
      // terminal delete record remains visible after Kong no longer returns
      // the plugin. When it is still live, the Kong response remains the
      // source of truth and the hint is ignored.
      const pluginTypeHint = typeof req.query.pluginType === 'string' ? req.query.pluginType : undefined;
      const pluginType = plugin?.name ?? pluginTypeHint;
      const adapter = pluginType ? getAdapter(pluginType) : undefined;
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
