# Architecture decision records

Decisions that constrain every workspace in this repository. A decision that binds one
workspace only is a PDR in that workspace's `DECISIONS.md` (below). The bar is high: if a
rule can be a CI gate, the gate is the rule and the ADR only keeps the why.

Cite these as `plugins ADR-NNNN` outside this repository.

## Index

| ADR | Title | Status |
|-----|-------|--------|
| [0003](0003-dummy-workspace-is-the-reference-implementation.md) | The dummy workspace is the reference implementation | Accepted 2026-09-10; §2/§4/§5 superseded by 0012, §3 amended by 0009 |
| [0004](0004-workspaces-track-the-devportal-host-backstage-version.md) | Workspaces track the DevPortal host's Backstage version, never "latest" | Accepted 2026-09-10; amended 2026-09-22 (§5) |
| [0006](0006-adopt-rhdh-plugin-program-patterns-by-criterion.md) | Adopt the RHDH plugin-program patterns as our reference, by criterion | Accepted 2026-09-17 |
| [0008](0008-workspace-is-the-unit-root-is-a-router.md) | The workspace is the unit; the monorepo root is a router | Accepted 2026-09-17 |
| [0009](0009-four-named-proofs-and-the-official-test-flow.md) | Four named proofs and the official test flow | Accepted 2026-09-17; amended 2026-09-22 (§6) |
| [0010](0010-publish-only-through-the-export-overlays-retire-npm.md) | Plugins are published only through the export overlays; npm publish is retired | Accepted 2026-09-17 |
| [0011](0011-ci-gates-are-the-standards-versioning-by-changesets.md) | CI gates are the standards; versions come from changesets | Accepted 2026-09-17; amended 2026-09-22 (§2, §3) |
| [0012](0012-workspaces-are-scaffolded-from-a-template-dummy-is-its-proof.md) | Workspaces are scaffolded from a template | Accepted 2026-09-17; superseded in part 2026-09-21; §3 implemented 2026-09-22 |

The numbers are those of the series that started in `devportal-plugins-parent`; these
eight moved here on 2026-09-22. The gaps are records that stay with the program there:
[0001](https://github.com/veecode-platform/devportal-plugins-parent/blob/main/docs/adr/0001-record-architecture-decisions.md)
(how ADRs are written),
[0002](https://github.com/veecode-platform/devportal-plugins-parent/blob/main/docs/adr/0002-planning-lives-outside-the-monorepo.md)
(superseded) and
[0007](https://github.com/veecode-platform/devportal-plugins-parent/blob/main/docs/adr/0007-rules-live-with-the-code-parent-keeps-business-decisions.md)
(which decisions live where). 0005 became `kong-tools` PDR-026. New ADRs continue the
series from 0013; never reuse or renumber.

## Plugin decision records (PDR)

A workspace keeps its own design decisions in `DECISIONS.md` at the workspace root. Those
entries are plugin decision records, numbered `PDR-001`, `PDR-002`, … per workspace, and
are never called ADRs. Cite them outside the workspace as `<workspace> PDR-NNN`. A PDR
that turns out to constrain other workspaces is promoted to an ADR here, and the PDR is
marked `Superseded by plugins ADR-NNNN`.

## Format

One file per decision, `NNNN-short-slug.md`. Start from [`template.md`](template.md).
Keep it short and cite evidence (file:line, commit, PR, run) in **Context**. Supersede
by adding a new ADR and updating the old one's status; do not edit an accepted
decision in place beyond status and dated amendment notes.

## Other decision series we cite

| Series | Cite as | Where |
|--------|---------|-------|
| Plugins program (business, roadmap, repo boundaries) | `parent ADR-NNNN` | [`devportal-plugins-parent/docs/adr/`](https://github.com/veecode-platform/devportal-plugins-parent/tree/main/docs/adr) |
| DevPortal platform (image, chart, runner, packaging) | `devportal-planning ADR-NNN` | `veecode-platform/devportal-planning`, `docs/adr/` |
