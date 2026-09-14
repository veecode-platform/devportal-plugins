import type { PromotionRecord } from '@veecode-platform/backstage-plugin-kong-service-manager-common';

/**
 * The five UX states from design 02 — a route plugin badge is derived from
 * its promotion history, not carried as its own field.
 */
export type PromotionBadgeKind =
  | 'experimental'
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

/**
 * Derives the badge to show for a route plugin from its promotion history
 * (newest-first or not — this sorts). `pluginCreatedAtSeconds` is the Kong
 * plugin's own `created_at` (epoch seconds, Admin API shape), used for the
 * experimental badge's age when there is no promotion record yet.
 */
export function derivePromotionBadge(
  records: PromotionRecord[] | undefined,
  pluginCreatedAtSeconds: number,
  now: number = Date.now(),
): PromotionBadge {
  const relevant = (records ?? []).filter(r => !RESET_STATES.has(r.state));

  if (relevant.length === 0) {
    return {
      kind: 'experimental',
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
