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
  /**
   * Only meaningful for a `code-owned` badge: whether the plugin is managed by
   * the Kong Ingress Controller, and so can be edited in code (issue #135). The
   * backend refuses edit-in-code for a code-owned plugin that lacks the KIC tag
   * (W1 gate), because the finalizer only converges on KIC-managed plugins — so
   * the "Edit in code" button hides here rather than offering a click that 400s.
   */
  editableInCode?: boolean;
};

/**
 * Tag the Kong Ingress Controller stamps on every entity it manages. Mirrors
 * the backend's `KIC_OWNERSHIP_TAG` (services/promotionTags.ts); a code-owned
 * plugin carries it exactly when edit-in-code applies.
 */
const KIC_OWNERSHIP_TAG = 'managed-by-ingress-controller';

function isKicManaged(pluginTags?: string[] | null): boolean {
  return (pluginTags ?? []).includes(KIC_OWNERSHIP_TAG);
}

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
      editableInCode: isKicManaged(ownership.pluginTags),
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

  // A finished `code-only` edit (issue #135) or a `delete` removal (issue #3)
  // both describe an operation on a plugin that was code-owned before and
  // stays code-owned after — there was never an experiment. Keeping a terminal
  // `codified`/`failed` badge would strip the plugin of every action the card
  // offers (a second edit, or a retry of the removal) with no way back. A
  // successful delete removes the plugin from the route, so this branch only
  // paints a card for a *failed* delete (the plugin is still present).
  if (
    TERMINAL_STATES.has(latest.state) &&
    (latest.mode === 'code-only' || latest.mode === 'delete')
  ) {
    return {
      kind: 'code-owned',
      record: latest,
      ageMs: now - pluginCreatedAtSeconds * 1000,
      editableInCode: isKicManaged(ownership.pluginTags),
    };
  }

  // A finished promote-to-code (experiment → code) leaves the plugin owned by
  // the Kong Ingress Controller: the finalizer only reaches `codified` once a
  // plugin carrying the KIC tag matches the promoted snapshot (promotionFinalizer
  // `handleApplying`). Such a plugin is editable in code exactly like one that
  // was born code-owned — the backend's own `resolvePromotionMode` accepts any
  // not-portal-managed, KIC-tagged plugin for edit-in-code and does not exclude
  // previously-promoted ones, and a plain code-owned plugin (no record) already
  // offers the action, letting the backend adjudicate on click. Keeping the
  // terminal `codified` badge here would single out promoted plugins as the one
  // code-owned case with no second edit and no way back (see DECISIONS ADR-017).
  // `mode` is intentionally not checked: it is optional on 1.4.x records, so a
  // legacy (undefined-mode) codified promotion converts too. `failed` stays
  // terminal — a failed handover needs a human (ADR-020).
  if (latest.state === 'codified' && isKicManaged(ownership.pluginTags)) {
    return {
      kind: 'code-owned',
      record: latest,
      ageMs: now - pluginCreatedAtSeconds * 1000,
      editableInCode: true,
    };
  }

  return {
    kind: badgeKind(latest.state),
    record: latest,
    ageMs: now - new Date(latest.updatedAt).getTime(),
  };
}
