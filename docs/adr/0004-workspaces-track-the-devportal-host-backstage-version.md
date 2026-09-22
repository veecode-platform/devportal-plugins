# 0004. Workspaces track the DevPortal host's Backstage version, never "latest"

- **Status**: Accepted (owner decision, 2026-09-10)
- **Date**: 2026-09-10
- **Deciders**: André Fernandes (program owner)
- **Migrated**: restated in `devportal-plugins` `CONTRIBUTING.md` (Host Backstage version) and enforced by `scripts/ci/check-backstage-version.js` — 2026-09-18, per [0007](https://github.com/veecode-platform/devportal-plugins-parent/blob/47ab25b/docs/adr/0007-rules-live-with-the-code-parent-keeps-business-decisions.md) §5
- **Supersedes**: —
- **Superseded by**: —
- **Moved**: from `devportal-plugins-parent` `docs/adr/` to this repository on 2026-09-22, under [parent ADR-0007](https://github.com/veecode-platform/devportal-plugins-parent/blob/main/docs/adr/0007-rules-live-with-the-code-parent-keeps-business-decisions.md) §1 (a rule lives in the repository whose code it governs). Number kept, so `plugins ADR-NNNN` citations stay valid; history before the move is in [the parent](https://github.com/veecode-platform/devportal-plugins-parent/blob/47ab25b/docs/adr).

## Context

Plugins built in `devportal-plugins` are loaded into one host: the DevPortal image built
from `veecode-platform/devportal-core` (the RHDH fork). A dynamic artifact is only proven
against the Backstage release that host ships (`devportal-planning` ADR-004, artifact
self-containment against the host contract).

Today nothing ties the workspaces to that release:

- `.github/workflows/automated-update.yml` runs every weekday and, through
  `.claude/commands/ci/upgrade-workspace.md`, executes
  `backstage-cli versions:bump --pattern '@{backstage,roadiehq,backstage-community}/*'`
  with no `--release`, so it moves each workspace to the **latest** Backstage release.
- The per-workspace `update-backstage` script (`backstage-cli versions:bump`) does the same
  by hand.
- As of 2026-09-10 the host declares `1.52.0` in its
  [`backstage.json`](https://github.com/veecode-platform/devportal-core/blob/main/backstage.json),
  while 13 workspaces are on 1.49.2, two on 1.49.4 and one (`ai-resources`) on 1.52.0.
  The automated bump would carry them past the host, not onto it.

ADR-0003 point 4 already requires dummy to track the host line; this ADR extends the rule
to every workspace and fixes the source of truth.

## Decision

1. The **source of truth** for the Backstage version every workspace targets is the
   `version` field of `backstage.json` on the `main` branch of
   `veecode-platform/devportal-core`.
2. **No bump targets "latest".** The automated update and the manual `update-backstage`
   script read that value and pass it to `backstage-cli versions:bump --release <version>`.
   A bump that ignores the host version is a defect.
3. **Dummy first.** When the host value changes, dummy is upgraded and proven (build, test,
   dynamic export, load on the host image) before any other workspace follows.
4. A workspace **may lag** the host while catching up; it may **never lead** it. How long a
   lag is tolerated is a standard (`08-backstage-line`), not this ADR.
5. Each workspace's pinned line stays visible in its `backstage.json` and in
   `docs/inventory/workspaces.md`.

   *Amended 2026-09-22:* the parent inventory is retired (parent ADR-0007 §5). The line is
   visible in each `backstage.json`, in the host-version check of the CI gate and in the
   weekly upgrade-dashboard issue. The `08-backstage-line` standard named in §4 was never
   written; until it is, lag is visible but not bounded.

## Consequences

- **Positive**: every plugin is built against the release it will run in; the weekday bump
  becomes a "catch up with the host" job instead of a drift generator; the host upgrade
  becomes a visible, ordered event (dummy, then the rest).
- **Negative / trade-offs**: the CI job and the command prompts must fetch a file from
  another repo (network dependency, failure mode to handle); workspaces on a newer line
  than the host would have to be held or downgraded (`ai-resources` is already on 1.52.0,
  equal to the host, so none today); security fixes that land only in a newer Backstage
  wait for the host to move.
- **Follow-ups**: M6 implements the pinned bump for dummy and rewires the workflow and
  command prompts for all workspaces; `operations/host-line-upgrade.md` and
  `operations/dependency-updates.md` document the mechanism; standard 08 sets the tolerated
  lag; the inventory records each workspace's line at each sweep.

## Alternatives considered

- **Keep bumping to latest** — proves plugins against a Backstage the host does not run;
  the observed 1.49 → 1.52 gap shows drift already happens in the other direction too.
- **Pin a version by hand in the monorepo** (a root file with the target) — a second copy
  of the truth that nobody bumps; the host repo already declares it.
- **Track the RHDH upstream release line instead of the fork** — the fork can re-anchor
  independently (`devportal-planning` ADR-002 moved to `main`/1.52 before RHDH cut its
  release branch); the fork is what we ship into.
