# 0012. Workspaces are scaffolded from a template; dummy is a preserved reference fixture

- **Status**: Accepted (owner decision, 2026-09-17)
- **§3 implemented (2026-09-22)**: `yarn create-workspace` now creates the product package with `backstage-cli new` (`devportal-plugins` #178) after the M8 acceptance runs showed the hand-copied skeleton falling behind the host line and lacking the upstream auth pattern; the template keeps only the workspace shell.
- **Superseded in part (2026-09-21)**: By owner decision, `workspaces/dummy-template/` is the single source of truth for scaffolding new workspaces; `workspaces/dummy` is a preserved reference fixture, not regenerated from the template, and no CI equivalence check exists. This corrects the executed scaffold model.
- **Amended (2026-09-22)**: the template lives in `scripts/workspace-template/` (§1).
- **Date**: 2026-09-17
- **Deciders**: Giovani Corrêa (decision), André Fernandes (ratification)
- **Supersedes**: [0003](0003-dummy-workspace-is-the-reference-implementation.md) §2, §4 and §5 only (the generator direction: `dummy-template` is the source for new workspaces; `dummy` remains a preserved reference fixture). §1, §3 (as amended by ADR-0009 §5), §6–9 of ADR-0003 stand.
- **Superseded by**: —
- **Moved**: from `devportal-plugins-parent` `docs/adr/` to this repository on 2026-09-22, under [parent ADR-0007](https://github.com/veecode-platform/devportal-plugins-parent/blob/main/docs/adr/0007-rules-live-with-the-code-parent-keeps-business-decisions.md) §1 (a rule lives in the repository whose code it governs). Number kept, so `plugins ADR-NNNN` citations stay valid; history before the move is in [the parent](https://github.com/veecode-platform/devportal-plugins-parent/blob/47ab25b/docs/adr).

## Context

Creating a workspace today is copying `dummy` by hand and renaming every "dummy" in about
ten files; the root `package.json` has no scripts. Upstream runs `yarn create-workspace`
(`rhdh-repo-tools workspace create`), which calls `@backstage/create-app --template-path`
with its own template and adds the changesets config; the template generates a shell only
and the dev app is added by hand. ADR-0003 makes `dummy` the reference implementation that
must always build, test, export and load on the host image, and (§4) planned a generator
that cherry-picks elements *from* dummy.

Keeping both a source template and a preserved reference fixture is intentional:
`dummy-template` is the source for new workspaces, while `dummy` is retained for reference
and host-image proofs.

## Decision

1. `workspaces/dummy-template/` holds the workspace template with `{{name}}` placeholders
   in the Backstage template format and is the single source of truth for scaffolding new
   workspaces. A root script,
   `yarn create-workspace <name> --role <role>`, renders it and selects the harness pieces
   by role (ADR-0009 §5): dev app, dev backend, Playwright config, `yarn dev:dynamic`,
   `.changeset/`, the `AGENTS.md` template with the "how to test" section pre-filled for the
   role. No dependency on `@backstage/create-app`; the format allows switching later.

   *Amended 2026-09-22 (owner decision):* the template moved from `workspaces/dummy-template/`
   to `scripts/workspace-template/`, beside the script that renders it, as upstream keeps its
   workspace template inside its repo tooling (`rhdh-plugins`
   `workspaces/repo-tools/packages/cli/src/lib/workspaces/templates/workspace`). It is not a
   workspace, so it no longer needs a marker to be excluded from the gates. Earlier mentions
   of `workspaces/dummy-template/` in this record refer to that location.
2. **`workspaces/dummy` is a preserved reference fixture, not a generated output.** It is
   not regenerated from `workspaces/dummy-template/`, and no CI check renders the template
   and asserts equality with it. It remains the reference that builds, tests, exports
   dynamically and loads on the host image (ADR-0003; it is never published, §8).
3. Inside a workspace, plugins and packages are created with `yarn new` (Backstage
   standard).
4. Onboarding into the export overlay is **not** part of the scaffold. The
   `devportal-publish` skill generates `workspaces/<x>/{source.json, plugins-list.yaml,
   backstage.json, metadata/*.yaml}`, the `Plugin` entity and the `all.yaml` line, and
   opens the overlay PR; the workspace `AGENTS.md` documents the step.

## Consequences

- **Positive**: "harness sized to the role" becomes a command instead of an instruction;
  a new family starts with the mandatory `AGENTS.md`, the four-proof section and the gates
  already wired.
- **Negative / trade-offs**: the preserved `dummy` fixture is not regenerated when the
  template changes, so the two may diverge; the `--role` matrix must be kept in one place.
- **Follow-ups**: template and script; migrate `dummy`'s `LIFECYCLE.md`,
  Makefile and `playwright.config.ts` into the template.

## Alternatives considered

- **Copy `dummy` with a rename script** — cheapest, but every dev-only quirk of dummy is
  copied forward and the role matrix has no place to live.
- **`@backstage/create-app --template-path` as upstream** — generates a shell only; our
  harness pieces would be added by hand, which is what we are removing.
