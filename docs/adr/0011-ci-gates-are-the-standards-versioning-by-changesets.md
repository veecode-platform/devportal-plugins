# 0011. CI gates are the standards; versions come from changesets; mechanical bumps are deterministic

- **Status**: Accepted (owner decision, 2026-09-17)
- **Date**: 2026-09-17
- **Deciders**: Giovani Corrêa (decision), André Fernandes (ratification)
- **Supersedes**: —
- **Superseded by**: —
- **Moved**: from `devportal-plugins-parent` `docs/adr/` to this repository on 2026-09-22, under [parent ADR-0007](https://github.com/veecode-platform/devportal-plugins-parent/blob/main/docs/adr/0007-rules-live-with-the-code-parent-keeps-business-decisions.md) §1 (a rule lives in the repository whose code it governs). Number kept, so `plugins ADR-NNNN` citations stay valid; history before the move is in [the parent](https://github.com/veecode-platform/devportal-plugins-parent/blob/47ab25b/docs/adr).

## Context

`devportal-plugins` has no gate on pull requests: only `publish.yml` (release) and
`automated-update.yml` (nightly agent-driven dependency update, idle since the V3
migration, scheduled for reactivation). `docs/standards/01-workspace-layout.md` here is
prose nothing verifies. ADR-0004 (accepted 2026-09-10) has no gate, which is why thirteen of the
fifteen real workspaces still lag the host (ten on 1.49.2, three on 1.49.4) while it declares 1.52.0.

Upstream `rhdh-plugins/.github/workflows/ci.yml` detects the workspaces touched by a PR and
runs, in each: immutable install, `tsc:full`, prettier, lint, tests, API reports,
Playwright when a config exists; changesets are verified. Versions come from changesets
(`.changeset/*.md` naming the package and the bump), a bot opens the "Version Packages"
PR, a human merges it; `.fullsend/AGENTS.md` adds "match the bump level to the issue's
intent, not the size of the diff". Backstage-line bumps are `backstage-cli versions:bump
--release <line>` + `yarn dedupe` + PR (`version-bump.yml`), no model involved; `rhdh-skill`
ADR-0001 keeps agents for judgement calls (triage, compatibility).

All fifteen real workspaces already expose `tsc:full`, `lint:all`, `test:all`, `build:all`
(fourteen expose `prettier:check`); the workflow is close to drop-in. Unknown: how many
workspaces are red today under `tsc:full` and `lint:all`.

## Decision

1. **A standard that has no gate is a recommendation.** Everything we want to bind is a CI
   check; `CONTRIBUTING.md` explains the why, the gate decides.
2. Adopt upstream's `ci.yml` shape: a job that lists the workspaces changed by the PR and a
   matrix job running, per workspace, `tsc:full`, `prettier:check`, `lint:all`, `test:all`,
   Playwright when `playwright.config.ts` exists, and the ADR-0004 check (`backstage.json`
   equals the host's, or a declared exception).

   *Amended 2026-09-22:* the matrix also runs `build:all` (`backstage-cli repo build
   --all`), as upstream `rhdh-plugins` does in every workspace job, so a package that
   type-checks but does not build fails in the plugin's own PR, not first in the overlay
   export.
3. **Report mode first.** The gate ships with `continue-on-error` until the workspaces are
   green, then becomes blocking. Heavier checks (API reports, knip, `config:check`,
   `list-deprecations`) are opt-in per workspace, as `community-plugins` does with
   `bcp.json`.
4. `test:all` must pass with "no tests found" where the role matrix (ADR-0009 §5) allows
   zero tests (themes, `common-library`); the exemption is written in that workspace's
   `AGENTS.md`.
5. **Versioning by changesets, not for publishing.** Every change to a published package
   carries a `.changeset/` entry with the bump chosen by intent; the "Version Packages" PR
   bumps `package.json`, writes the CHANGELOG and tags the release; the human merge is the
   gate of ADR-0010 §3 on the monorepo side. The tag is what the overlay's `source.json`
   points at.
6. **Deterministic for the mechanical, agent for the ambiguous.** The Backstage-line bump
   becomes upstream's `version-bump.yml` reading the host version. `automated-update.yml`
   is reclassified step by step at its planned reactivation: single-answer steps become
   scripts; judgement steps stay agentic and run after the deterministic ones, on the PR
   they opened.

## Consequences

- **Positive**: ADR-0004 becomes measurable for the first time; a reviewer and an agent see
  the same verdict on every PR; the bump intent is written where it is reviewed.
- **Negative / trade-offs**: making fifteen workspaces green is the hidden cost, sized only
  by running the gate in report mode; changesets add ceremony per PR for a two-person team.
- **Follow-ups**: copy `ci.yml` and `scripts/ci/list-workspaces-with-changes.js`; write
  the host-version check; add `.changeset/` config to the scaffold template (ADR-0012);
  weekly upgrade dashboard (upstream `upgrade-dashboard.yml`) as the lag view.

## Alternatives considered

- **Keep standards as prose** — the last week proved it: an accepted ADR with no gate
  changed nothing.
- **Blocking gate from day one** — would freeze all sixteen workspaces on the first red run.
- **Conventional commits instead of changesets** — no CHANGELOG, no reviewable version PR,
  no place where the agent must declare "does this break anyone?".
