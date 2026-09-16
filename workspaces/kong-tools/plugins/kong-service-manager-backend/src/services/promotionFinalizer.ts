import { isDeepStrictEqual } from 'util';
import { LoggerService } from '@backstage/backend-plugin-api';
import type { AssociatedPluginsResponse } from '@veecode-platform/backstage-plugin-kong-service-manager-common';
import { GitlabClient } from './GitlabClient';
import { KongServiceManagerService } from './KongServiceManagerService';
import { PromotionRecordRow, PromotionStore } from './promotionStore';
import { MrDetail, decodeMrDetail, encodeMrDetail } from './mrDetail';
import { getAdapter } from './adapters';
import { EXPERIMENTAL_TAG_PREFIX, KIC_OWNERSHIP_TAG, promotionBranch } from './promotionTags';

export interface PromotionFinalizerConfig {
  /** Minutes a record may sit in `applying` before the finalizer gives up and marks it `failed` (ADR-020: nothing is restored). */
  applyTimeoutMinutes: number;
}

/**
 * Runs one reconciliation pass over every non-terminal promotion record
 * (design 02, "Finalizer"). One record's failure (a transient GitLab or
 * Kong error) is logged and left for the next tick — it never blocks the
 * rest of the queue, and there is no attempt cap: `mr-open` and
 * `awaiting-deploy` are meant to wait indefinitely per spec, and `applying`
 * is bounded by `applyTimeoutMinutes`, not by a retry count.
 *
 * Handover invariant (ADR-020): once the promoted chart is on the default
 * branch, the experimental plugin must not exist on the route — Kong allows
 * one plugin per (type, route), so an experiment still sitting there makes
 * the Kong Ingress Controller fail to create the code-owned plugin and, in
 * DB mode, stop syncing the dataplane. The experiment is therefore deleted
 * at merge (`mr-open` → `awaiting-deploy`), never later, and a timed-out
 * `applying` record ends in `failed` without recreating it.
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

  // Teardown interaction (design 02 + design 01): the portal teardown does
  // NOT archive the project — it removes `catalog-info.yaml` from the default
  // branch and lets discovery drop the entity (spec 01, ADR-0028). So a
  // promotion is orphaned when the project is archived, gone, OR unregistered
  // (ADR-023). Checked before any state-specific handling — a record with no
  // coordinates yet (a draft from before the repo was resolved) has nothing
  // to check.
  let project: { archived: boolean; defaultBranch: string } | undefined;
  if (detail?.host && detail?.projectSlug) {
    const status = await getProjectStatus(gitlab, detail);
    if (status === 'gone') {
      // GitLab masks "not authorised" as 404, so a project that was readable
      // at promote time answering 404 may be a token/permission problem, not
      // a deletion. Destructive cleanup needs the observation to persist for
      // at least GONE_CONFIRMATION_MS across ticks (ADR-023 hardening).
      const firstSeen = detail.projectGoneSince ?? new Date().toISOString();
      if (Date.now() - Date.parse(firstSeen) < GONE_CONFIRMATION_MS) {
        if (!detail.projectGoneSince) {
          await store.transition(record.id, record.state, { detail: encodeMrDetail({ ...detail, projectGoneSince: firstSeen }) });
        }
        logger.warn('kong-service-manager promotion: project answers 404; waiting for confirmation before aborting', {
          promotionId: record.id,
          since: firstSeen,
        });
        return;
      }
      await abortForTeardown({ logger, gitlab, kong, store, record, detail, reason: 'gone' });
      return;
    }
    if (detail.projectGoneSince) {
      // Readable again: the 404 was transient — forget it.
      await store.transition(record.id, record.state, { detail: encodeMrDetail({ ...detail, projectGoneSince: undefined }) });
    }
    if (status === 'unregistered' || status.archived) {
      await abortForTeardown({ logger, gitlab, kong, store, record, detail, reason: status === 'unregistered' ? 'unregistered' : 'archived' });
      return;
    }
    project = status;
  }

  switch (record.state) {
    case 'draft':
      return handleDraft({ gitlab, store, record, detail });
    case 'mr-open':
      return handleMrOpen({ logger, gitlab, kong, store, record, detail });
    case 'awaiting-deploy':
      return handleAwaitingDeploy({ gitlab, store, record, detail, project });
    case 'applying':
      return handleApplying({ logger, kong, store, config, record, detail });
    default:
      // Terminal states never appear in store.listActive() — defensive only.
      return;
  }
}

/** A project 404 must persist this long before it counts as "gone" (ADR-023 hardening). */
export const GONE_CONFIRMATION_MS = 2 * 60 * 1000;

/** The file whose presence on the default branch means "this service is registered" (spec 01). */
export const CATALOG_INFO_PATH = 'catalog-info.yaml';

async function getProjectStatus(
  gitlab: GitlabClient,
  detail: MrDetail,
): Promise<{ archived: boolean; defaultBranch: string } | 'gone' | 'unregistered'> {
  let project: { archived: boolean; defaultBranch: string };
  try {
    project = await gitlab.getProject(detail);
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 404) return 'gone';
    throw err;
  }
  if (project.archived) return project;
  const registered = await gitlab.fileExistsOnRef(detail, project.defaultBranch, CATALOG_INFO_PATH);
  return registered ? project : 'unregistered';
}

/**
 * Deletes the per-type promotion branch unless an MR is still open on it —
 * that MR belongs to a newer promotion (another route, or a promote that
 * raced this tick) and its branch must survive (ADR-022 hardening).
 */
async function deletePromotionBranchIfUnused(
  gitlab: GitlabClient,
  repo: { host: string; projectSlug: string },
  pluginType: string,
): Promise<void> {
  const branch = promotionBranch(pluginType);
  const open = await gitlab.findOpenMergeRequest(repo, branch);
  if (open) return;
  await gitlab.deleteBranch(repo, branch);
}

async function abortForTeardown(deps: {
  logger: LoggerService;
  gitlab: GitlabClient;
  kong: KongServiceManagerService;
  store: PromotionStore;
  record: PromotionRecordRow;
  detail: MrDetail;
  reason: 'archived' | 'gone' | 'unregistered';
}): Promise<void> {
  const { logger, gitlab, kong, store, record, detail, reason } = deps;
  const experimental = await findExperimentalPlugin(kong, record);
  if (experimental) {
    await kong.removeRoutePlugin(record.instance, record.route_id, experimental.id);
  }
  // Close the promotion MR so the repo does not keep an orphan (ADR-023).
  // Best-effort: a gone project has no MR to close, and a failure here must
  // not keep the record out of its terminal state.
  if (reason !== 'gone' && detail.iid !== undefined) {
    try {
      await gitlab.closeMergeRequest(detail, detail.iid);
      await deletePromotionBranchIfUnused(gitlab, detail, record.plugin_type);
    } catch (err) {
      logger.warn('kong-service-manager promotion: could not close the MR after teardown', {
        promotionId: record.id,
        error: String(err),
      });
    }
  }
  await store.transition(record.id, 'aborted-teardown', {
    detail: `project ${reason} during an open promotion; leftover experimental plugin removed, merge request closed`,
  });
  logger.info('kong-service-manager promotion aborted by teardown', {
    promotionId: record.id,
    routeId: record.route_id,
    pluginType: record.plugin_type,
    reason,
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
  logger: LoggerService;
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
    // The branch would otherwise outlive the MR and be found stale by the
    // next promote of this type (ADR-022). Best-effort: a failure here must
    // not keep the record out of `discarded`.
    try {
      await deletePromotionBranchIfUnused(gitlab, detail, record.plugin_type);
    } catch (err) {
      deps.logger.warn('kong-service-manager promotion: could not delete the promotion branch after discard', {
        promotionId: record.id,
        error: String(err),
      });
    }
    await store.transition(record.id, 'discarded');
    return;
  }
  if (mr.state !== 'merged') return; // still opened (or locked) — check again next tick

  // Handover (ADR-020): the experiment goes the moment the chart is on the
  // default branch, BEFORE CI can deploy it — from that point on the route
  // belongs to the code-owned plugin, and two of them cannot coexist.
  // Idempotent: if the process crashed between this delete and the
  // transition below, the record is still `mr-open`, the next tick finds no
  // experiment and just transitions.
  const experimental = await findExperimentalPlugin(kong, record);
  if (experimental) {
    await kong.removeRoutePlugin(record.instance, record.route_id, experimental.id);
  }

  await store.transition(record.id, 'awaiting-deploy', {
    detail: encodeMrDetail({
      ...detail,
      parkedSince: new Date().toISOString(),
      mergedAt: mr.mergedAt ?? new Date().toISOString(),
      experimentRemovedAt: new Date().toISOString(),
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

  // Unbounded on purpose (ADR-020): a merged-but-never-deployed chart just
  // stays parked. The route already runs without the plugin because its
  // owner merged the chart; recreating the experiment here would collide
  // with the code-owned one on the next sync. The spread keeps `mergedAt`
  // and `experimentRemovedAt` readable for the badge.
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

  // No delete here (ADR-020): the experiment was removed at merge, so by the
  // time a record reaches `applying` the route is already free for the
  // code-owned plugin.
  //
  // Converged only when the KIC-owned plugin exists AND its
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

  // Timeout exceeded — stop automating and hand the route back to a human.
  // Nothing is restored (ADR-020): recreating the experiment would collide
  // with the merged chart's plugin on the next controller sync, which is the
  // incident this ordering exists to prevent. Recovery is a human decision —
  // fix the chart, or revert the merge request.
  await store.transition(record.id, 'failed', {
    detail:
      `code-owned '${record.plugin_type}' plugin did not converge on route '${record.route_id}' within ` +
      `${config.applyTimeoutMinutes} min after a successful deploy of the merged chart; the experiment was ` +
      `removed at merge and is intentionally not restored (one plugin per type per route). Check the Kong ` +
      `Ingress Controller events for the KongPlugin, or revert the merge request.`,
  });
  logger.warn('kong-service-manager promotion timed out without converging', {
    promotionId: record.id,
    routeId: record.route_id,
    pluginType: record.plugin_type,
    applyTimeoutMinutes: config.applyTimeoutMinutes,
  });
}

async function untagExperimental(kong: KongServiceManagerService, record: PromotionRecordRow): Promise<void> {
  const plugin = await findExperimentalPlugin(kong, record);
  if (!plugin) return;
  const filteredTags = (plugin.tags ?? []).filter(t => !t.startsWith(EXPERIMENTAL_TAG_PREFIX));
  await kong.editRoutePlugin(record.instance, record.route_id, plugin.id, { tags: filteredTags });
}

/** The live experimental plugin for this record's route, if it is still there — the delete is idempotent everywhere it is used. */
async function findExperimentalPlugin(
  kong: KongServiceManagerService,
  record: PromotionRecordRow,
): Promise<AssociatedPluginsResponse | undefined> {
  return findPluginByTag(kong, record.instance, record.route_id, record.plugin_type, p =>
    (p.tags ?? []).some(t => t.startsWith(EXPERIMENTAL_TAG_PREFIX)),
  );
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
