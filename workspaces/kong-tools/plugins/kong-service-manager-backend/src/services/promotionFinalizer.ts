import { isDeepStrictEqual } from 'util';
import { LoggerService } from '@backstage/backend-plugin-api';
import type { AssociatedPluginsResponse } from '@veecode-platform/backstage-plugin-kong-service-manager-common';
import { GitlabClient } from './GitlabClient';
import { KongServiceManagerService } from './KongServiceManagerService';
import { PromotionRecordRow, PromotionStore } from './promotionStore';
import { MrDetail, decodeMrDetail, encodeMrDetail } from './mrDetail';
import { getAdapter } from './adapters';
import { EXPERIMENTAL_TAG_PREFIX, KIC_OWNERSHIP_TAG } from './promotionTags';

export interface PromotionFinalizerConfig {
  /** Minutes a record may sit in `applying` before the finalizer restores the experimental plugin and marks it `failed-restored`. */
  applyTimeoutMinutes: number;
}

/**
 * Runs one reconciliation pass over every non-terminal promotion record
 * (design 02, "Finalizer"). One record's failure (a transient GitLab or
 * Kong error) is logged and left for the next tick — it never blocks the
 * rest of the queue, and there is no attempt cap: `mr-open` and
 * `awaiting-deploy` are meant to wait indefinitely per spec, and `applying`
 * is bounded by `applyTimeoutMinutes`, not by a retry count.
 */
export async function reconcilePromotions(deps: {
  logger: LoggerService;
  gitlab: GitlabClient;
  kong: KongServiceManagerService;
  store: PromotionStore;
  config: PromotionFinalizerConfig;
}): Promise<void> {
  const { logger, gitlab, kong, store, config } = deps;
  const active = await store.listActive();
  for (const record of active) {
    try {
      await reconcileOne({ logger, gitlab, kong, store, config, record });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn('kong-service-manager promotion reconcile failed, will retry', {
        promotionId: record.id,
        instance: record.instance,
        routeId: record.route_id,
        pluginType: record.plugin_type,
        state: record.state,
        error: message,
      });
    }
  }
}

async function reconcileOne(deps: {
  logger: LoggerService;
  gitlab: GitlabClient;
  kong: KongServiceManagerService;
  store: PromotionStore;
  config: PromotionFinalizerConfig;
  record: PromotionRecordRow;
}): Promise<void> {
  const { logger, gitlab, kong, store, config, record } = deps;
  const detail = decodeMrDetail(record.detail);

  // Teardown interaction (design 02): if the project the record's repo
  // coordinates point at is archived or gone, abort the promotion before
  // any state-specific handling — a record with no coordinates yet (a
  // draft from before the repo was even resolved) has nothing to check.
  let project: { archived: boolean; defaultBranch: string } | undefined;
  if (detail?.host && detail?.projectSlug) {
    const status = await getProjectStatus(gitlab, detail);
    if (status === 'gone' || status.archived) {
      await abortForTeardown({ logger, kong, store, record });
      return;
    }
    project = status;
  }

  switch (record.state) {
    case 'draft':
      return handleDraft({ gitlab, store, record, detail });
    case 'mr-open':
      return handleMrOpen({ gitlab, kong, store, record, detail });
    case 'awaiting-deploy':
      return handleAwaitingDeploy({ gitlab, store, record, detail, project });
    case 'applying':
      return handleApplying({ logger, kong, store, config, record, detail });
    default:
      // Terminal states never appear in store.listActive() — defensive only.
      return;
  }
}

async function getProjectStatus(
  gitlab: GitlabClient,
  detail: MrDetail,
): Promise<{ archived: boolean; defaultBranch: string } | 'gone'> {
  try {
    return await gitlab.getProject(detail);
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 404) return 'gone';
    throw err;
  }
}

async function abortForTeardown(deps: {
  logger: LoggerService;
  kong: KongServiceManagerService;
  store: PromotionStore;
  record: PromotionRecordRow;
}): Promise<void> {
  const { logger, kong, store, record } = deps;
  const experimental = await findPluginByTag(
    kong,
    record.instance,
    record.route_id,
    record.plugin_type,
    p => (p.tags ?? []).some(t => t.startsWith(EXPERIMENTAL_TAG_PREFIX)),
  );
  if (experimental) {
    await kong.removeRoutePlugin(record.instance, record.route_id, experimental.id);
  }
  await store.transition(record.id, 'aborted-teardown', {
    detail: 'project archived or removed during an open promotion; leftover experimental plugin removed',
  });
  logger.info('kong-service-manager promotion aborted by teardown', {
    promotionId: record.id,
    routeId: record.route_id,
    pluginType: record.plugin_type,
  });
}

/**
 * Draft-orphan probe (P3 handoff note 1): a record can be stuck `draft`
 * with repo coordinates but no `mr_ref` if the process crashed after the MR
 * was actually opened but before that was recorded. Probes GitLab by the
 * promotion's deterministic source branch instead of assuming the record's
 * absence of `mr_ref` means no MR exists.
 */
async function handleDraft(deps: {
  gitlab: GitlabClient;
  store: PromotionStore;
  record: PromotionRecordRow;
  detail: MrDetail | undefined;
}): Promise<void> {
  const { gitlab, store, record, detail } = deps;
  if (!detail?.host || !detail?.projectSlug) return; // repo not resolved yet — nothing to probe

  const branch = `kong-promote/${record.plugin_type}`;
  const mr = await gitlab.findOpenMergeRequest(detail, branch);
  if (!mr) return; // genuinely still in-flight, or no MR was ever opened

  await store.transition(record.id, 'mr-open', {
    mrRef: mr.webUrl,
    detail: encodeMrDetail({ host: detail.host, projectSlug: detail.projectSlug, projectId: mr.projectId, iid: mr.iid }),
  });
}

async function handleMrOpen(deps: {
  gitlab: GitlabClient;
  kong: KongServiceManagerService;
  store: PromotionStore;
  record: PromotionRecordRow;
  detail: MrDetail | undefined;
}): Promise<void> {
  const { gitlab, kong, store, record, detail } = deps;
  if (detail?.iid === undefined) return; // defensive — mr-open always has repo coords + iid

  const mr = await gitlab.getMergeRequest(detail, detail.iid);
  if (mr.state === 'closed') {
    await untagExperimental(kong, record);
    await store.transition(record.id, 'discarded');
    return;
  }
  if (mr.state !== 'merged') return; // still opened (or locked) — check again next tick

  await store.transition(record.id, 'awaiting-deploy', {
    detail: encodeMrDetail({
      ...detail,
      parkedSince: new Date().toISOString(),
      mergedAt: mr.mergedAt ?? new Date().toISOString(),
    }),
  });
}

async function handleAwaitingDeploy(deps: {
  gitlab: GitlabClient;
  store: PromotionStore;
  record: PromotionRecordRow;
  detail: MrDetail | undefined;
  project: { archived: boolean; defaultBranch: string } | undefined;
}): Promise<void> {
  const { gitlab, store, record, detail, project } = deps;
  if (!detail?.host || !detail?.projectSlug || !detail?.mergedAt || !project) return; // defensive

  const deployed = await gitlab.hasSuccessfulDeployAtOrAfter(detail, project.defaultBranch, detail.mergedAt);
  if (!deployed) return; // parked — never assumes merge means applied (design 02)

  await store.transition(record.id, 'applying', {
    detail: encodeMrDetail({ ...detail, applyingSince: new Date().toISOString() }),
  });
}

async function handleApplying(deps: {
  logger: LoggerService;
  kong: KongServiceManagerService;
  store: PromotionStore;
  config: PromotionFinalizerConfig;
  record: PromotionRecordRow;
  detail: MrDetail | undefined;
}): Promise<void> {
  const { logger, kong, store, config, record, detail } = deps;

  // Step 3: delete the experimental plugin FIRST — Kong allows only one
  // plugin instance per (type, route), so the KIC-owned one cannot exist
  // until this is gone (design 02's ordering constraint). Idempotent: a
  // crash-retry that finds it already deleted just proceeds to step 4.
  const experimental = await findPluginByTag(
    kong,
    record.instance,
    record.route_id,
    record.plugin_type,
    p => (p.tags ?? []).some(t => t.startsWith(EXPERIMENTAL_TAG_PREFIX)),
  );
  if (experimental) {
    await kong.removeRoutePlugin(record.instance, record.route_id, experimental.id);
  }

  // Step 4: converged only when the KIC-owned plugin exists AND its
  // normalized config equals the promoted snapshot — existence alone would
  // also match an already-codified plugin from an earlier promotion of the
  // same type/route (the update case), so it is never sufficient on its own.
  const kicPlugin = await findPluginByTag(
    kong,
    record.instance,
    record.route_id,
    record.plugin_type,
    p => (p.tags ?? []).includes(KIC_OWNERSHIP_TAG),
  );
  if (kicPlugin) {
    const adapter = getAdapter(record.plugin_type);
    if (adapter) {
      const normalized = adapter.fromRendered({ config: kicPlugin.config });
      if (isDeepStrictEqual(normalized, record.config_snapshot)) {
        await store.transition(record.id, 'codified');
        return;
      }
    } else {
      logger.error('kong-service-manager promotion has no adapter for its own plugin type', {
        promotionId: record.id,
        pluginType: record.plugin_type,
      });
    }
  }

  // Timeout: bounded only in `applying` — `mr-open`/`awaiting-deploy` wait indefinitely per spec.
  const applyingSince = detail?.applyingSince;
  if (!applyingSince) return; // defensive — set at the awaiting-deploy → applying transition
  const elapsedMs = Date.now() - Date.parse(applyingSince);
  if (elapsedMs < config.applyTimeoutMinutes * 60_000) return;

  // Timeout exceeded — restore the experimental plugin from the promoted
  // snapshot (P3 handoff note 3: config_snapshot is normalized-only; Kong
  // applies schema defaults for the rest) and stop automating. Retry is
  // explicit, from the UI (design 02) — no retry endpoint exists yet (P4
  // report).
  const restoreTag =
    detail?.projectId !== undefined && detail?.iid !== undefined
      ? `${EXPERIMENTAL_TAG_PREFIX}${detail.projectId}-${detail.iid}`
      : undefined;
  await kong.addPluginToRoute(record.instance, record.route_id, {
    name: record.plugin_type,
    config: record.config_snapshot as Record<string, unknown>,
    tags: restoreTag ? [restoreTag] : undefined,
  });
  await store.transition(record.id, 'failed-restored', {
    detail: `applyTimeoutMinutes (${config.applyTimeoutMinutes}) exceeded waiting for the code-owned '${record.plugin_type}' plugin to converge on route '${record.route_id}'; experimental plugin restored from the promoted snapshot.`,
  });
  logger.info('kong-service-manager promotion timed out, restored the experimental plugin', {
    promotionId: record.id,
    routeId: record.route_id,
    pluginType: record.plugin_type,
  });
}

async function untagExperimental(kong: KongServiceManagerService, record: PromotionRecordRow): Promise<void> {
  const plugin = await findPluginByTag(
    kong,
    record.instance,
    record.route_id,
    record.plugin_type,
    p => (p.tags ?? []).some(t => t.startsWith(EXPERIMENTAL_TAG_PREFIX)),
  );
  if (!plugin) return;
  const filteredTags = (plugin.tags ?? []).filter(t => !t.startsWith(EXPERIMENTAL_TAG_PREFIX));
  await kong.editRoutePlugin(record.instance, record.route_id, plugin.id, { tags: filteredTags });
}

async function findPluginByTag(
  kong: KongServiceManagerService,
  instance: string,
  routeId: string,
  pluginType: string,
  matches: (plugin: AssociatedPluginsResponse) => boolean,
): Promise<AssociatedPluginsResponse | undefined> {
  const plugins = await kong.getRouteAssociatedPlugins(instance, routeId);
  return plugins.find(p => p.name === pluginType && matches(p));
}
