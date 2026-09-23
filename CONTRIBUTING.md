# Contributing

This repository contains independent Backstage plugin workspaces. This file is the
single home for rules shared across workspaces; use [CONTEXT.md](CONTEXT.md) for
vocabulary and use the affected workspace's `AGENTS.md` for local facts.

## Purpose and adoption criterion

The RHDH plugin ecosystem is the reference architecture for this program. Classify
each proposed pattern before adopting it:

> Adopt when the piece is about where a rule lives or how an agent finds it, or when it is tooling that runs without infrastructure we do not have. Adapt when it assumes Red Hat infrastructure (OpenShift, Prow, Jira, Vertex AI, fullsend). Skip when it is process for twenty-plus teams (support tiers, per-workspace CODEOWNERS, the fullsend agent chain).

The criterion is written here once so that the adopt, adapt, or skip question is not
reopened for each upstream pattern.

## Repository layout and what the root keeps

`workspaces/` is the repository's inventory. Do not maintain a second workspace
inventory in root guidance. The root `package.json` is tooling-only and has no
workspace dependencies; each workspace owns its dependencies and lockfile.

The root keeps repository-wide routing, process, vocabulary, decisions, automation,
and templates:

- `AGENTS.md` and `.agents/skills/` route an agent to a workspace.
- `CONTRIBUTING.md` owns these cross-workspace rules.
- `CONTEXT.md` owns the glossary.
- `docs/adr/` holds the decisions that constrain every workspace.
- `.github/workflows/` and `scripts/` hold repository-wide automation.
  `scripts/workspace-template/` is the single source for new workspace scaffolding. It
  lives with the scaffold script, not under `workspaces/`, as upstream keeps its
  workspace template inside its repo tooling, so no gate mistakes it for a workspace.
- The root tooling scripts validate and generate workspace structure; they do not
  replace a workspace's package manager or lockfile.

The root `Makefile` and `README.md` remain repository-level entry points; program
roadmaps and milestones live in `devportal-plugins-parent`. Workspace work starts
from the affected workspace root.

## Workspace layout

Each `workspaces/<name>/` directory is a self-contained unit with its own
`package.json`, lockfile, Backstage version declaration, development configuration,
and decisions. Its usual shape is:

```text
workspaces/<name>/
├── packages/app        # dev shell frontend
├── packages/backend/   # dev shell backend
├── plugins/            # product packages
├── package.json
├── Makefile
├── backstage.json
└── workspace-specific configuration and harness files
```

Use the [dev shell and Product definitions in CONTEXT.md](CONTEXT.md). In structure,
`packages/app` and `packages/backend` contain only the shell, fixtures, wiring, and
development configuration; `plugins/` contains what is exported. The dev shell is
never published. Product packages must remain independent of `packages/`: the
[`check-product-independence.js`](scripts/ci/check-product-independence.js) CI check
runs Backstage's `@backstage/no-undeclared-imports` and `@backstage/no-relative-monorepo-imports`
rules on product source and scans product package metadata for references into the dev
shell. Proof 2 still verifies the actual dynamic export in the local runner.

Static plugins are imported into the dev shell at build time. Dynamic plugins are
exported by the Red Hat Developer Hub CLI into a plugin's `dist-dynamic/` directory
and loaded without rebuilding the portal. Frontend packages expose their plugin and
extensions from `src/index.ts`; backend packages define a backend plugin and expose
the registration entry point there. A backend `pluginId` determines its API path,
while a frontend plugin `id` identifies the frontend plugin.

Packages in one workspace may use `workspace:^` or `workspace:*` dependencies. Those
references must be resolved before any legacy registry packaging target is used; a
workspace Makefile may provide the replacement and restoration targets.

The common test stack is Jest with Backstage testing utilities for package and dev
shell tests, `supertest` with backend test utilities for backend HTTP tests, and
Playwright where a workspace has a `playwright.config.ts`. Playwright follows the
upstream `PLAYWRIGHT_URL` convention: without it, the workspace starts its own
Backstage environment and checks backend readiness; with it, the suite targets an
already-running portal without starting another server. Frontend tests that call a
backend provide both the discovery and fetch APIs. Backend tests use either a real
service through `startTestBackend` or a mocked service behind an Express router.

Existing exceptions are documented facts, not a second inventory: `ldap-auth` is
static-only and has no dynamic export. The `about` workspace now has a local app and
backend harness; its dynamic export remains a separate proof boundary.

## Reference implementation

`scripts/workspace-template` is the source for new workspace scaffolding. It contains
the common shape plus the role-sized `frontend-plugin` and `backend-plugin` harnesses:
the dev shell, the dynamic-plugin configuration, the Playwright harness and the agent
guidance. The product package itself is not in the template. `yarn create-workspace`
creates it with `backstage-cli new`, the official Backstage template for the role, and
then grafts only what the dynamic export needs (`private`, `backstage.pluginPackages`,
`scalprum`, the `export-dynamic` script). A backend plugin additionally gets a
`/health` route declared `unauthenticated`, the pattern upstream RHDH backends use, so
proof 2 is a plain `curl`. Versions come from `versions:bump --release <host>` run by
the scaffold, so a new workspace lands on the host line regardless of the template's
pins. `workspaces/dummy` remains the existing reference fixture and is not regenerated
by the scaffold. Use the template for new workspaces and dummy for accumulated examples
and host-proof regressions.

The dummy workspace and its plugin packages are `private: true`; it is never
published. Conventions land in dummy before they become requirements elsewhere. A
workspace deviation is recorded in that workspace's `AGENTS.md`; a cross-workspace
deviation belongs in a root ADR.

## Host Backstage version

The [host version definition in CONTEXT.md](CONTEXT.md) is the compatibility contract.
Every workspace tracks the `version` in `devportal-core`'s `backstage.json` on `main`,
keeps its own `backstage.json` visible, and bumps that pin by pull request. No bump
targets an unpinned latest release: a workspace may lag the host, but it may never
lead it. Dummy is upgraded and proven first when the host value changes.

The host-version check is
[`scripts/ci/check-backstage-version.js`](scripts/ci/check-backstage-version.js); it
still runs in report mode (`--strict` fails closed and is the switch to flip once every
workspace is green). The script's local contract is in
[`scripts/ci/README.md`](scripts/ci/README.md).

## The four proofs and the official test flow

The four proofs, the official flow, the rule that no proof substitutes for another,
and the fact that `devportal-local` is the only runner for proofs 2 and 4 are all
defined in [CONTEXT.md](CONTEXT.md#proving-a-plugin). Do not restate them here or in a
workspace `AGENTS.md`; link to that section. This section adds only the rules that
follow from those definitions:

- Prove before you publish. Proofs 1 and 2 come before the overlay PR, every time:
  proof 3 runs in the overlay CI, the most expensive place to find a defect the
  local runner would have shown. Skipping proof 2 is allowed only on purpose (a
  hotfix, for example), and the overlay PR says so: the `devportal-publish` skill
  records whether proof 2 ran, and `--skip-proof2 "<reason>"` records why it did not.
- The overlay is a distribution recipe, not a development environment. Develop an
  adaptation in the source checkout, prove it with proofs 1 and 2, then register the
  result in the overlay recipe.
- The official runner owns proof 2; workspace-local development aids do not change
  the official proof ownership.

## Which proofs apply to which `backstage.role`

The harness is sized to the package role; not every workspace needs the same shell.

| `backstage.role` | Workspace harness | Minimum proof 2 before publishing |
|---|---|---|
| `frontend-plugin` (page, card, header) | `packages/app` + Playwright | Route renders in `devportal-local` |
| `frontend-plugin` theme | `packages/app` | App loads with the theme and no console error |
| `frontend-plugin` scaffolder field extension | `packages/app` + example template | Template form renders the field |
| `backend-plugin` | `packages/backend` + unit tests | `/api/<id>/health` answers |
| `backend-plugin-module` catalog | `packages/backend` with host plugin + fixtures | Example entity is ingested |
| `backend-plugin-module` scaffolder | `packages/backend` | Action is listed in `/api/scaffolder/v2/actions` |
| `backend-plugin-module` auth | `packages/backend` + its fixture | Test sign-in completes |
| `common-library` | Unit tests | None; consumers prove it |

## Third-party code

A plugin we fork or vendor stays traceable to its source. Either it lives in a sibling fork
repository with the upstream remote configured, or the vendored copy carries a `NOTICE` or
`UPSTREAM.md` naming the upstream repository and commit it came from (examples:
`workspaces/aws-cost-insights/plugins/*/NOTICE`,
`workspaces/marketplace/plugins/devportal-marketplace-frontend/UPSTREAM.md`). Update that
file whenever the copy is re-synced.

## Exposure rule

This public repository documents plugin behavior and the code needed to operate it.
Do not add tenants, customers, hostnames, or internal-platform context. Keep that
context in the consumption repositories and link the relevant business decision in
[`devportal-plugins-parent`](https://github.com/veecode-platform/devportal-plugins-parent).

## Decisions

Put an ADR in [`docs/adr/`](docs/adr/README.md) only when the decision constrains every
workspace. Put a workspace-only decision in that workspace's `DECISIONS.md` as a PDR, in
the format described in the same README. Roadmap, milestones and business context live in
[`devportal-plugins-parent`](https://github.com/veecode-platform/devportal-plugins-parent);
link it rather than copying it into this repository.

## Pull requests

Keep pull requests small and use one workspace per pull request when possible.
Changesets are for versioning intent only, as defined by ADR-0011; they are not a
delivery channel.
Create one with `yarn changeset` inside the affected workspace (every workspace
declares `@changesets/cli`, as upstream does); CI verifies changesets in report mode.

The named CI gates are `tsc:full`, `build:all`, `prettier:check`, `lint:all`, and `test:all`.
They currently run in report mode. See [`.github/workflows/ci.yml`](.github/workflows/ci.yml)
and [`scripts/ci/README.md`](scripts/ci/README.md) for the implementation and local
contract.

## Agent guardrails

Every product workspace must have an `AGENTS.md` following the five-section source in
[`scripts/workspace-template/AGENTS.md`](scripts/workspace-template/AGENTS.md). The
template links back here instead of copying cross-workspace rules.
[`/.agents/`](.agents/) and [`/.claude/`](.claude/) are protected by
[`.github/CODEOWNERS`](.github/CODEOWNERS) so agent guardrails require owner review.
