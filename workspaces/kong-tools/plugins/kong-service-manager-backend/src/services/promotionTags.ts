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
