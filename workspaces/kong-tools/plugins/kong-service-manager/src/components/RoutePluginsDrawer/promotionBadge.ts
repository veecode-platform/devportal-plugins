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

  return {
    kind: badgeKind(latest.state),
    record: latest,
    ageMs: now - new Date(latest.updatedAt).getTime(),
  };
}
