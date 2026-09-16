/**
 * Kong entity tags the finalizer (P4) uses to tell the experimental plugin
 * apart from the code-owned one on the same route (design 02, "Finalizer" —
 * Kong allows only one plugin instance per (type, route), so at any given
 * tick at most one of the two exists).
 */

/** Prefix the promote endpoint (P3) tags the experimental plugin with (`promotion-pending:<project-id>-<mr-iid>`). */
export const EXPERIMENTAL_TAG_PREFIX = 'promotion-pending:';

/** Tag the Kong Ingress Controller applies to every plugin it manages (design 02, finalizer step 4). */
export const KIC_OWNERSHIP_TAG = 'managed-by-ingress-controller';

/**
 * Source branch the promote endpoint commits to. One per plugin type, not per
 * promotion: an open MR must be found again by a crash-retry (P3), and a
 * second promotion of the same type on the same repo is refused while one is
 * open. The branch is recreated from the default branch whenever no MR is open
 * for it (ADR-022) — a stale one left by a merge or a discard is never reused.
 */
export function promotionBranch(pluginType: string): string {
  return `kong-promote/${pluginType}`;
}
