# 0008. The workspace is the unit; the monorepo root is a router

- **Status**: Accepted (owner decision, 2026-09-17)
- **Date**: 2026-09-17
- **Deciders**: Giovani Corrêa (decision), André Fernandes (ratification)
- **Supersedes**: —
- **Superseded by**: —
- **Moved**: from `devportal-plugins-parent` `docs/adr/` to this repository on 2026-09-22, under [parent ADR-0007](https://github.com/veecode-platform/devportal-plugins-parent/blob/main/docs/adr/0007-rules-live-with-the-code-parent-keeps-business-decisions.md) §1 (a rule lives in the repository whose code it governs). Number kept, so `plugins ADR-NNNN` citations stay valid; history before the move is in [the parent](https://github.com/veecode-platform/devportal-plugins-parent/blob/47ab25b/docs/adr).

## Context

In `rhdh-plugins` each `workspaces/<family>` owns its dependencies, lockfile, release,
dev application, `AGENTS.md` and decisions. The root `AGENTS.md` is four lines; the skill
`.agents/skills/rhdh-workspace/SKILL.md` tells the agent to identify the affected
workspace, read *its* `AGENTS.md`, run commands from the workspace root and pass the CI
gates. Seven of 23 workspaces carry an `AGENTS.md` (28–216 lines, no imposed template);
`CLAUDE.md` is the single line `@AGENTS.md`. `workspaces/cost-management/AGENTS.md`
states: "`packages/` is strictly the dev environment shell. Never add product logic
there."

In `devportal-plugins` (2026-09-17): the root `AGENTS.md` has 285 lines including a
workspace inventory, a command table and a Docker testing section; 0 of 16 workspaces
have an `AGENTS.md`; `kong-tools/DECISIONS.md` already holds 25 PDRs — the one family
that applied the pattern.

## Decision

1. Everything that belongs to one family lives in its workspace: commands, layout,
   non-obvious architecture, how to test, PR conventions (`AGENTS.md`), and its decisions
   (`DECISIONS.md`, PDRs as defined in `docs/adr/README.md`; `docs/adrs/` only past
   roughly forty entries).
2. The root keeps only: a thin `AGENTS.md` pointing to the router skill; `CONTRIBUTING.md`
   (common process, adoption criterion, gates); `CONTEXT.md` (glossary, ADR-0009);
   `docs/adr/` with a high bar (constrains every workspace); `.agents/skills/`;
   `.github/workflows/`; `templates/` and `scripts/` (ADR-0012). The inventory in the
   root `AGENTS.md` is deleted: the repository is the inventory.
3. A router skill `.agents/skills/devportal-workspace/SKILL.md` (Agent Skills format,
   `.claude/skills` symlinked) does what upstream's does: locate the workspace, read its
   `AGENTS.md`, run from its root, list the gates to pass before finishing.
4. Every workspace `AGENTS.md` follows a **mandatory template** with five sections:
   commands · layout · architecture (non-obvious parts only) · how to test (which proofs
   apply to this family's roles, per ADR-0009) · PR and changeset conventions. It links to
   `CONTRIBUTING.md`; it never restates it (ADR-0007 §3).
5. **`packages/` is the dev shell; `plugins/` is the product.** The shell may hold
   fixtures, wiring and dev configuration (e.g. `kong-tools/packages/backend/src/permissionPolicy.ts`,
   a fake policy with three test users). It may never hold anything the exported plugin
   needs. Test: delete `packages/` and the `dist-dynamic` export must still be complete.
   Packaging wrappers (the marketplace `*-dynamic` packages) belong in neither and are
   removed with ADR-0010.
6. Plugin-lifecycle skills live in `.agents/skills/` of the monorepo (`devportal-workspace`,
   `devportal-context` for sibling discovery, `devportal-publish` for the overlay PR). No
   separate skills repository until a second consumer needs one. `CODEOWNERS` protects
   `.agents/` and `.claude/` so agents cannot rewrite their own guardrails.

## Consequences

- **Positive**: an agent carries only the context of the family it touches; changes in one
  family stop being a risk for the others; the 285-line root stops rotting.
- **Negative / trade-offs**: sixteen `AGENTS.md` files to write (the template and the
  scaffold, ADR-0012, do most of it); some repetition of *structure* across workspaces is
  accepted — never of rules.
- **Follow-ups**: router skill; template; migration of root content; `CODEOWNERS` entry.

## Alternatives considered

- **Keep a rich root `AGENTS.md`** — it is where the inventory went stale and where
  family-specific test instructions diverged (three different image tags).
- **Free-form workspace `AGENTS.md` as upstream** — upstream has 20+ teams that wrote
  theirs over months; we have two people and sixteen empty workspaces, so consistency buys
  more than freedom here.
