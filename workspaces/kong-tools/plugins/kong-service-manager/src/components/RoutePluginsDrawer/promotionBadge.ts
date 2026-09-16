import type { PromotionRecord } from '@veecode-platform/backstage-plugin-kong-service-manager-common';

/**
 * The five UX states from design 02, plus `code-owned` (ADR-017) — a route
 * plugin badge is derived from its promotion history and ownership, not
 * carried as its own field.
 */
export type PromotionBadgeKind =
  | 'experimental'
  | 'code-owned'
  | 'mr-open'
  | 'pending-deploy'
  | 'codified'
  | 'failed-restored';

export type PromotionBadge = {
  kind: PromotionBadgeKind;
  /** The record the badge is derived from — absent for a plain experiment with no promotion history. */
  record?: PromotionRecord;
  /** Age of the current badge state, in milliseconds. */
  ageMs: number;
};

/** States that no longer represent a live promotion — the plugin reads as a plain experiment again. */
const RESET_STATES = new Set(['discarded', 'aborted-teardown']);

/**
 * Terminal states whose experiment no longer exists (ADR-020: deleted at
 * merge). A portal-managed plugin found on the route afterwards cannot be the
 * one this record describes.
 */
const STALE_WHEN_PORTAL_MANAGED = new Set(['codified', 'failed']);

/** States a promotion never leaves on its own. */
const TERMINAL_STATES = new Set(['codified', 'failed', 'failed-restored']);

function badgeKind(state: PromotionRecord['state']): PromotionBadgeKind {
  switch (state) {
    case 'draft':
    case 'mr-open':
      return 'mr-open';
    case 'awaiting-deploy':
    case 'applying':
      return 'pending-deploy';
    case 'codified':
      return 'codified';
    // Both failure states share one badge: `failed` (ADR-020) and the legacy
    // `failed-restored` differ in what the backend did to the experiment, not
    // in what the user sees — a promotion that needs a human.
    case 'failed':
    case 'failed-restored':
      return 'failed-restored';
    default:
      return 'experimental';
  }
}

/** Ownership inputs (ADR-017) — absent/empty `instanceDefaultTags` means the instance has no ownership signal, so every plugin is treated as promotable (unchanged behaviour). */
export type PromotionOwnership = {
  pluginTags?: string[] | null;
  instanceDefaultTags?: string[];
};

function hasOwnershipSignal({ instanceDefaultTags }: PromotionOwnership): boolean {
  return !!instanceDefaultTags && instanceDefaultTags.length > 0;
}

function isPortalManaged(
  { pluginTags, instanceDefaultTags }: PromotionOwnership,
): boolean {
  if (!instanceDefaultTags || instanceDefaultTags.length === 0) return true;
  const tags = pluginTags ?? [];
  return instanceDefaultTags.every(tag => tags.includes(tag));
}

/**
 * Derives the badge to show for a route plugin from its promotion history
 * (newest-first or not — this sorts) and ownership (ADR-017).
 * `pluginCreatedAtSeconds` is the Kong plugin's own `created_at` (epoch
 * seconds, Admin API shape), used for the experimental/code-owned badge's
 * age when there is no promotion record yet. Promotion records only ever
 * exist for portal-managed plugins (the backend gate refuses to promote a
 * code-owned one), so ownership only matters in the no-record branch.
 */
export function derivePromotionBadge(
  records: PromotionRecord[] | undefined,
  pluginCreatedAtSeconds: number,
  now: number = Date.now(),
  ownership: PromotionOwnership = {},
): PromotionBadge {
  const relevant = (records ?? []).filter(r => !RESET_STATES.has(r.state));

  if (relevant.length === 0) {
    return {
      kind: isPortalManaged(ownership) ? 'experimental' : 'code-owned',
      ageMs: now - pluginCreatedAtSeconds * 1000,
    };
  }

  const latest = relevant.reduce((a, b) =>
    new Date(a.updatedAt).getTime() >= new Date(b.updatedAt).getTime() ? a : b,
  );

  // Records are keyed by (route, plugin type), not by plugin id, so a terminal
  // record from an earlier promotion outlives the plugin it describes. Once the
  // code-owned plugin is gone from the route (removed from the chart) a plugin
  // of the same type that carries the portal's ownership tags is a NEW
  // experiment: the stale `codified`/`failed` badge would hide its Promote
  // button. Only decidable when the instance has an ownership signal.
  if (
    STALE_WHEN_PORTAL_MANAGED.has(latest.state) &&
    hasOwnershipSignal(ownership) &&
    isPortalManaged(ownership)
  ) {
    return { kind: 'experimental', ageMs: now - pluginCreatedAtSeconds * 1000 };
  }

  // A finished `code-only` promotion (issue #135) describes an edit to a
  // plugin that was code-owned before the promotion and stays code-owned
  // after it — there was never an experiment. Keeping its terminal
  // `codified`/`failed` badge would strip the plugin of every action the card
  // offers, including a second edit in code, with no way back.
  if (TERMINAL_STATES.has(latest.state) && latest.mode === 'code-only') {
    return {
      kind: 'code-owned',
      record: latest,
      ageMs: now - pluginCreatedAtSeconds * 1000,
    };
  }

  return {
    kind: badgeKind(latest.state),
    record: latest,
    ageMs: now - new Date(latest.updatedAt).getTime(),
  };
}
