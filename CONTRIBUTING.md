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
inventory in root guidance. There is no root `package.json`; each workspace owns its
dependencies and lockfile.

The root keeps repository-wide routing, process, vocabulary, decisions, automation,
and templates:

- `AGENTS.md` and `.agents/skills/` route an agent to a workspace.
- `CONTRIBUTING.md` owns these cross-workspace rules.
- `CONTEXT.md` owns the glossary.
- `docs/adr/` is reserved for decisions that constrain every workspace.
- `.github/workflows/`, `scripts/`, and `templates/` hold repository-wide automation
  and scaffolding.

The root `Makefile`, `README.md`, and `ROADMAP.md` remain repository-level entry
points. Root-level Makefile helpers include `make echo-paths` and
`make copy-dynamic-plugins`; workspace work still starts from the affected workspace
root.

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
never published. The check is simple: delete `packages/`, and the `dist-dynamic`
export must still be complete.

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
Playwright where a workspace has a `playwright.config.ts`. Frontend tests that call a
backend provide both the discovery and fetch APIs. Backend tests use either a real
service through `startTestBackend` or a mocked service behind an Express router.

Existing exceptions are documented facts, not a second inventory: `ldap-auth` is
static-only and has no dynamic export, while `about` has no hosting app and therefore
has no hosting-app start command.

## Reference implementation

`workspaces/dummy` is the reference implementation and the concrete form of the
workspace convention. Use it for Makefile structure, package metadata including
`backstage.role`, `pluginId`, and `publishConfig`, test organization, dynamic export
harness shape, and README structure.

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

The host-version check runs in report mode through
[`scripts/ci/check-backstage-version.js`](scripts/ci/check-backstage-version.js) until
stage 7. The script's local contract is in [`scripts/ci/README.md`](scripts/ci/README.md).

## The four proofs and the official test flow

Use the [four proof definitions in CONTEXT.md](CONTEXT.md) without redefining them.
Proof 1 is exercised in the workspace; proof 2 uses `devportal-local` without
publishing; proof 3 is the overlay smoke on the published OCI artifact; proof 4 is
the delivered user journey in `devportal-local`. No proof substitutes for another,
and `devportal-local` is the only runner for proofs 2 and 4.

Build in devportal-plugins, prove in devportal-local, publish through the export-overlays.

The overlay is a distribution recipe, not a development environment. Develop an
adaptation in the source checkout, prove it with proofs 1 and 2, then register the
result in the overlay recipe. Existing per-workspace compose files are transitional
harnesses and do not change the official proof ownership.

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

## Exposure rule

This public repository documents plugin behavior and the code needed to operate it.
Do not add tenants, customers, hostnames, or internal-platform context. Keep that
context in the consumption repositories and link the relevant business decision in
[`devportal-plugins-parent`](https://github.com/veecode-platform/devportal-plugins-parent).

## Decisions

Put an ADR in root `docs/adr/` only when the decision constrains every workspace.
Put a workspace-only decision in that workspace's `DECISIONS.md` as a PDR, using the
[PDR format](https://github.com/veecode-platform/devportal-plugins-parent/blob/main/docs/adr/README.md).
Business context lives in `devportal-plugins-parent`; link it rather than copying it
into this repository.

## Pull requests

Keep pull requests small and use one workspace per pull request when possible.
Changesets are for versioning intent only, as defined by ADR-0011; they are not a
delivery channel.

The named CI gates are `tsc:full`, `prettier:check`, `lint:all`, and `test:all`.
They currently run in report mode. See [`.github/workflows/ci.yml`](.github/workflows/ci.yml)
and [`scripts/ci/README.md`](scripts/ci/README.md) for the implementation and local
contract.

## Agent guardrails

Every workspace must have an `AGENTS.md` following
[`templates/workspace/AGENTS.md`](templates/workspace/AGENTS.md). The template has
five sections and links back here instead of copying cross-workspace rules.
[`/.agents/`](.agents/) and [`/.claude/`](.claude/) are protected by
[`.github/CODEOWNERS`](.github/CODEOWNERS) so agent guardrails require owner review.
