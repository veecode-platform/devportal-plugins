import { isDeepStrictEqual } from 'util';
import { LoggerService } from '@backstage/backend-plugin-api';
import type { AssociatedPluginsResponse } from '@veecode-platform/backstage-plugin-kong-service-manager-common';
import { GitlabClient } from './GitlabClient';
import {
  KongApiError,
  KongServiceManagerService,
} from './KongServiceManagerService';
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
 * is bounded by `applyTimeoutMinutes`, not by a retry count. The one
 * exception is a 404 from Kong for the record's route: once it has persisted
 * for the confirmation window and the Kong instance still lists its routes,
 * the record ends as `failed` with the reason in `detail` (PDR-028).
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
      await reconcileRecord({ logger, gitlab, kong, store, config, record });
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

/**
 * Ends a record whose route Kong has answered 404 for past the confirmation
 * window, while the Kong instance still lists its routes (PDR-028). A 404 still
 * inside the window, or an instance that does not list its routes, leaves the
 * record active.
 * Any other error propagates to the caller, which logs it and retries on the
 * next tick. If recording the end fails, that error propagates the same way.
 */
async function reconcileRecord(
  deps: Parameters<typeof reconcileOne>[0],
): Promise<void> {
  const { logger, store, record } = deps;
  try {
    await reconcileOne(deps);
  } catch (err) {
    if (err instanceof RouteUnconfirmedError) {
      logger.warn(
        'kong-service-manager promotion: its route answers 404; waiting for confirmation before ending the promotion',
        {
          promotionId: record.id,
          instance: record.instance,
          routeId: record.route_id,
          since: err.since,
        },
      );
      return;
    }
    if (err instanceof RoutesUnreadableError) {
      logger.warn(
        'kong-service-manager promotion: its route answers 404 past the confirmation window, but the Kong instance did not list its routes; keeping the promotion active',
        {
          promotionId: record.id,
          instance: record.instance,
          routeId: record.route_id,
          since: err.since,
          reason: err.reason,
        },
      );
      return;
    }
    if (!(err instanceof RouteGoneError)) throw err;
    await store.transition(record.id, 'failed', {
      detail:
        `Kong has no route '${err.routeId}' on instance '${err.instance}' (it answered 404), so the promotion stopped. ` +
        `Nothing is restored; check whether the app's route was deleted.`,
    });
    logger.warn(
      'kong-service-manager promotion stopped: its route no longer exists on Kong',
      {
        promotionId: record.id,
        instance: record.instance,
        routeId: record.route_id,
        pluginType: record.plugin_type,
        state: record.state,
        reason: err.message,
      },
    );
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
      detail.projectGoneSince = undefined;
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

/**
 * Only an `experiment` record ever created, tagged, or froze a plugin in Kong.
 * A `code-only` edit (issue #135) and a `delete` removal (issue #3) both target
 * an already code-owned plugin, so every Kong-*write* site in the finalizer
 * (tag, untag, delete-at-merge) must skip its write for them; reads (the
 * convergence checks) are unaffected. Gating on "is an experiment" rather than
 * "is not code-only" keeps a third mode from silently reactivating those writes.
 */
function isExperimentMode(record: PromotionRecordRow): boolean {
  return record.mode === 'experiment';
}

/** Delete-in-code (issue #3): the MR removes the plugin's template; convergence is the KIC-owned plugin *disappearing*, the inverse of the promote/codify check. */
function isDeleteMode(record: PromotionRecordRow): boolean {
  return record.mode === 'delete';
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
  // A code-only (issue #135) or delete (issue #3) record never created an
  // experiment in Kong, so there is nothing to remove — only the MR/branch
  // cleanup below applies.
  // A route whose 404 has persisted, with the instance still listing its
  // routes, holds no experiment to remove (PDR-028), so the teardown still
  // closes the MR and reaches `aborted-teardown`.
  let routeGone = false;
  if (isExperimentMode(record)) {
    try {
      const experimental = await findExperimentalPlugin({
        kong,
        store,
        record,
        detail,
      });
      if (experimental) {
        await kong.removeRoutePlugin(
          record.instance,
          record.route_id,
          experimental.id,
        );
      }
    } catch (err) {
      if (!(err instanceof RouteGoneError)) throw err;
      routeGone = true;
      logger.warn(
        'kong-service-manager promotion: its route no longer exists on Kong during teardown; nothing to remove',
        {
          promotionId: record.id,
          routeId: record.route_id,
          instance: record.instance,
          reason: err.message,
        },
      );
    }
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
  const removed = routeGone
    ? 'the route no longer exists on Kong, so no experimental plugin was left to remove'
    : 'leftover experimental plugin removed';
  await store.transition(record.id, 'aborted-teardown', {
    detail: isExperimentMode(record)
      ? `project ${reason} during an open promotion; ${removed}, merge request closed`
      : `project ${reason} during an open ${record.mode} operation; merge request closed (no experiment in Kong)`,
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
  const route: RouteReadDeps = { kong, store, record, detail };
  if (mr.state === 'closed') {
    // A code-only (issue #135) or delete (issue #3) record never tagged an
    // experiment — nothing to untag; the branch cleanup below applies to all modes.
    if (isExperimentMode(record)) {
      await untagExperimental(route);
    }
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
  // A `code-only` (issue #135) or `delete` (issue #3) record never created an
  // experiment — the plugin was already code-owned — so there is nothing to
  // remove here. For a delete, the code-owned plugin is removed by the Kong
  // Ingress Controller once the merged chart (now missing its template) deploys.
  if (isExperimentMode(record)) {
    const experimental = await findExperimentalPlugin(route);
    if (experimental) {
      await kong.removeRoutePlugin(record.instance, record.route_id, experimental.id);
    }
  }

  await store.transition(record.id, 'awaiting-deploy', {
    detail: encodeMrDetail({
      ...detail,
      parkedSince: new Date().toISOString(),
      mergedAt: mr.mergedAt ?? new Date().toISOString(),
      ...(isExperimentMode(record) ? { experimentRemovedAt: new Date().toISOString() } : {}),
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

  // No Kong write here (ADR-020): by the time a record reaches `applying` the
  // route is already handed over — for a promote, the experiment was removed
  // at merge; for a delete (issue #3), the merged chart no longer declares the
  // plugin. `applying` only *reads* Kong to confirm the Ingress Controller has
  // converged.
  const route: RouteReadDeps = { kong, store, record, detail };
  const kicPlugin = isDeleteMode(record)
    ? await findPluginByTag(route, () => true)
    : await findPluginByTag(route, p =>
        (p.tags ?? []).includes(KIC_OWNERSHIP_TAG),
      );

  if (isDeleteMode(record)) {
    // Delete converges when no plugin of this type remains — the KIC
    // reconciled the removed template off the gateway. Query all owners here:
    // a stale plugin whose KIC tag was removed must not be mistaken for a
    // successful deletion.
    if (!kicPlugin) {
      await store.transition(record.id, 'codified');
      return;
    }
  } else if (kicPlugin) {
    // Promote/edit converge only when the KIC-owned plugin exists AND its
    // normalized config equals the promoted snapshot — existence alone would
    // also match an already-codified plugin from an earlier promotion of the
    // same type/route (the update case), so it is never sufficient on its own.
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
  // Nothing is restored (ADR-020): recovery is a human decision — fix the
  // chart, or revert the merge request.
  await store.transition(record.id, 'failed', {
    detail: isDeleteMode(record)
      ? `code-owned '${record.plugin_type}' plugin was still present on route '${record.route_id}' ` +
        `${config.applyTimeoutMinutes} min after a successful deploy of the chart with its template removed; ` +
        `the Kong Ingress Controller has not removed it. Check its events for the KongPlugin, or revert the ` +
        `merge request.`
      : `code-owned '${record.plugin_type}' plugin did not converge on route '${record.route_id}' within ` +
        `${config.applyTimeoutMinutes} min after a successful deploy of the merged chart; the experiment was ` +
        `removed at merge and is intentionally not restored (one plugin per type per route). Check the Kong ` +
        `Ingress Controller events for the KongPlugin, or revert the merge request.`,
  });
  logger.warn('kong-service-manager promotion timed out without converging', {
    promotionId: record.id,
    routeId: record.route_id,
    pluginType: record.plugin_type,
    mode: record.mode,
    applyTimeoutMinutes: config.applyTimeoutMinutes,
  });
}

async function untagExperimental(route: RouteReadDeps): Promise<void> {
  const plugin = await findExperimentalPlugin(route);
  if (!plugin) return;
  const filteredTags = (plugin.tags ?? []).filter(
    t => !t.startsWith(EXPERIMENTAL_TAG_PREFIX),
  );
  await route.kong.editRoutePlugin(
    route.record.instance,
    route.record.route_id,
    plugin.id,
    { tags: filteredTags },
  );
}

/** What a route read needs from this tick: the record's route, and its detail, which a read may stamp or clear (PDR-028). */
interface RouteReadDeps {
  kong: KongServiceManagerService;
  store: PromotionStore;
  record: PromotionRecordRow;
  detail: MrDetail | undefined;
}

/** The live experimental plugin for this record's route, if it is still there — the delete is idempotent everywhere it is used. */
async function findExperimentalPlugin(
  route: RouteReadDeps,
): Promise<AssociatedPluginsResponse | undefined> {
  return findPluginByTag(route, p =>
    (p.tags ?? []).some(t => t.startsWith(EXPERIMENTAL_TAG_PREFIX)),
  );
}

async function findPluginByTag(
  route: RouteReadDeps,
  matches: (plugin: AssociatedPluginsResponse) => boolean,
): Promise<AssociatedPluginsResponse | undefined> {
  const plugins = await listRoutePlugins(route);
  return plugins.find(p => p.name === route.record.plugin_type && matches(p));
}

/** A route 404 that persisted past the confirmation window, with the instance still listing its routes (PDR-028). */
class RouteGoneError extends Error {
  readonly instance: string;
  readonly routeId: string;

  constructor(instance: string, routeId: string) {
    super(`Kong has no route '${routeId}' on instance '${instance}'`);
    this.instance = instance;
    this.routeId = routeId;
  }
}

/** A route 404 still inside the confirmation window (PDR-028). */
class RouteUnconfirmedError extends Error {
  readonly since: string;

  constructor(since: string) {
    super(`Kong answered 404 for the route since ${since}`);
    this.since = since;
  }
}

/** A route 404 past the window whose Kong instance did not list its routes, so the route is not judged gone yet (PDR-028). */
class RoutesUnreadableError extends Error {
  readonly since: string;
  readonly reason: string;

  constructor(instance: string, since: string, reason: string) {
    super(`Kong instance '${instance}' did not list its routes: ${reason}`);
    this.since = since;
    this.reason = reason;
  }
}

/** A route 404 counts as gone only once it has persisted for GONE_CONFIRMATION_MS and the Kong instance still lists its routes (PDR-028). */
async function listRoutePlugins(
  route: RouteReadDeps,
): Promise<AssociatedPluginsResponse[]> {
  const { kong, store, record, detail } = route;
  let plugins: AssociatedPluginsResponse[];
  try {
    plugins = await kong.getRouteAssociatedPlugins(
      record.instance,
      record.route_id,
    );
  } catch (err) {
    if (!(err instanceof KongApiError && err.kongStatus === 404) || !detail)
      throw err;
    const since = detail.routeGoneSince ?? new Date().toISOString();
    if (Date.now() - Date.parse(since) < GONE_CONFIRMATION_MS) {
      if (!detail.routeGoneSince) {
        await store.transition(record.id, record.state, {
          detail: encodeMrDetail({ ...detail, routeGoneSince: since }),
        });
      }
      throw new RouteUnconfirmedError(since);
    }
    try {
      await kong.checkRoutesReadable(record.instance);
    } catch (listErr) {
      throw new RoutesUnreadableError(
        record.instance,
        since,
        listErr instanceof Error ? listErr.message : String(listErr),
      );
    }
    throw new RouteGoneError(record.instance, record.route_id);
  }
  if (detail?.routeGoneSince) {
    detail.routeGoneSince = undefined;
    await store.transition(record.id, record.state, {
      detail: encodeMrDetail(detail),
    });
  }
  return plugins;
}
