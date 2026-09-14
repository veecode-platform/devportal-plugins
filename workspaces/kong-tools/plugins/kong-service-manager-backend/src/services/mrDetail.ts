/**
 * Codec for the promotion record's `detail` column while the record is still
 * non-terminal (design 02 / ADR-014). `detail` is the finalizer's (P4) only
 * handle on which GitLab project a record belongs to — the `promotions`
 * table has no dedicated project/host columns — so every non-terminal state
 * that needs to reach GitLab again must keep these coordinates readable.
 *
 * `iid` is optional: the promote endpoint (P3) now persists `host` /
 * `projectSlug` / `projectId` on the draft as soon as the repo is resolved,
 * before the MR exists, so the finalizer can probe GitLab by source branch
 * for a draft stuck by a crash between MR creation and the `mr-open`
 * transition (plan P4, handoff note 1). `iid` is filled in once the MR is
 * known.
 *
 * The optional timestamp fields are additive, single-write markers the
 * finalizer uses as clocks (`applyTimeoutMinutes`, parked age) — every
 * finalizer write must decode-merge-encode rather than replace the object,
 * or a later write silently drops the coordinates a still-discardable
 * record needs (ADR-014: never clobber `detail` while the record can still
 * be discarded).
 */
export interface MrDetail {
  host: string;
  projectSlug: string;
  projectId: number;
  iid?: number;
  /** ISO timestamp set once when the record first parks in `awaiting-deploy`; never rewritten after. */
  parkedSince?: string;
  /** ISO timestamp of the MR's GitLab `merged_at`, set on the `mr-open` → `awaiting-deploy` transition — anchors the "deploy of the merge commit or newer" check. */
  mergedAt?: string;
  /** ISO timestamp set once when the record enters `applying`; anchors the `applyTimeoutMinutes` clock. Never rewritten after, so a per-tick write elsewhere can't reset the timeout. */
  applyingSince?: string;
}

export function encodeMrDetail(detail: MrDetail): string {
  return JSON.stringify(detail);
}

export function decodeMrDetail(detail: string | null): MrDetail | undefined {
  if (!detail) return undefined;
  try {
    return JSON.parse(detail) as MrDetail;
  } catch {
    return undefined;
  }
}
