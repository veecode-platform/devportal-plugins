# AI Agent Guidelines

Technical context for agents working in this repository. Humans should start with `README.md`. Every workspace carries its own `AGENTS.md` with plugin-level context; this file covers only how the repository works.

This repository is a collection of Backstage plugins for VeeCode DevPortal. Each directory under `workspaces/` is a self-contained Backstage hosting app (`packages/app` and `packages/backend`) with Yarn workspaces for its plugins (under `plugins/`), so related plugins are developed and tested together. Five workspaces ship a single package and have no hosting app today: `ai-resources`, `aws-s3-catalog`, `marketplace`, `veecode-theme`, `vertigo-theme`.

## Where things live

- **Here**: how to build, test, export and publish; per-workspace agent context; the `dummy` reference implementation; CI workflows and prompts.
- **Planning repository** `veecode-platform/devportal-plugins-parent` (a sibling checkout in the same workspace shell): inventory of workspaces and packages, status, roadmap, architecture decisions (cited as `plugins ADR-NNNN`), standards and operations runbooks. Do not add status tables, inventories or roadmaps to this repository; link there instead (plugins ADR-0002).
- **Workspace-local design decisions** live in that workspace's `DECISIONS.md` as plugin decision records, numbered `PDR-001`, `PDR-002`, … and cited as `<workspace> PDR-NNN`. They are never called ADRs.

## Repository Layout

```pre
devportal-plugins/
├── workspaces/                   # One directory per workspace; README.md lists them
│   ├── dummy/                    # Reference implementation — start here
│   └── <name>/
├── .github/workflows/            # publish.yml, automated-update.yml
├── .github/prompts/              # Prompts used by the automated update
├── .claude/commands/             # Claude Code commands (create-workspace, upgrade-workspace, …)
├── Makefile                      # Root-level cross-workspace utilities
├── catalog-info.yaml             # Catalog entity for this repository
├── CLAUDE.md                     # Claude Code-specific instructions
└── AGENTS.md                     # This file
```

There is **no root `package.json`**. Each workspace manages its own dependencies independently.

## Workspace Internal Structure

Every workspace is a self-contained Backstage app with Yarn workspaces:

```pre
workspaces/<name>/
├── packages/
│   ├── app/                      # Backstage frontend hosting app (for dev/testing only)
│   │   └── src/App.tsx           # Route registration, plugin wiring
│   └── backend/                  # Backstage backend hosting app (for dev/testing only)
│       └── src/index.ts          # Backend plugin registration
├── plugins/
│   ├── <plugin-name>/            # Frontend or backend plugin package
│   │   ├── src/
│   │   │   ├── plugin.ts         # Plugin definition (createPlugin / createBackendPlugin)
│   │   │   ├── index.ts          # Public exports
│   │   │   └── components/       # Frontend components (frontend plugins only)
│   │   ├── dev/index.tsx         # Standalone dev mode
│   │   └── package.json
│   ├── <plugin-name-backend>/    # Backend plugin (if workspace has both)
│   ├── <plugin-name-common>/     # Common library (shared types, API interfaces; if present)
│   └── <plugin-name-another>/    # Other plugins (scaffolder modules, backend modules, etc.)
├── README.md                     # For humans: what the plugins do, how to run and publish
├── AGENTS.md                     # For agents: architecture, mocks, gotchas (template: workspaces/dummy/AGENTS.md)
├── CLAUDE.md                     # Thin pointer to AGENTS.md
├── DECISIONS.md                  # Plugin decision records PDR-NNN (optional)
├── package.json                  # Workspace root — scripts, devDependencies
├── backstage.json                # Backstage release the workspace is on
├── Makefile                      # Build, publish, clean targets
├── app-config.yaml               # Backstage config for local dev
├── tsconfig.json                 # TypeScript configuration
├── docker-compose.yaml           # Container harness for dynamic plugins (if present)
├── dynamic-plugins.yaml          # Dynamic plugin config for that harness (if present)
├── app-config.dynamic.yaml       # App config overlay for that harness (if present)
└── dynamic/                      # Alternative harness folder used by some workspaces (if present)
```

**The hosting app is not published.** Only the `plugins/*` packages are released. The hosting app exists solely for development and testing.

## Commands Reference

### Per-Workspace (run from `workspaces/<name>/`)

| Command | Purpose |
|---------|---------|
| `yarn install` | Install dependencies |
| `yarn tsc` | TypeScript type checking |
| `yarn build:all` | Build all packages in workspace |
| `yarn test:all` | Run all tests (plugins + hosting app) |
| `yarn test:all --coverage` | Run all tests with coverage report |
| `yarn lint:all` | Lint all files |
| `yarn start` | Start the Backstage hosting app |
| `yarn update-backstage` | Run `backstage-cli versions:bump`. Workspaces track the DevPortal host's Backstage release (plugins ADR-0004); check the target release before bumping |

### Per-Plugin (run from `plugins/<name>/`)

| Command | Purpose |
|---------|---------|
| `yarn test --watchAll=false` | Run plugin tests (always use `--watchAll=false` to prevent hanging) |
| `yarn start` | Run plugin in standalone dev mode |
| `yarn build` | Build the plugin |
| `yarn lint` | Lint the plugin |

### Makefile Targets (run from `workspaces/<name>/`)

| Target | Purpose |
|--------|---------|
| `make build` | `yarn install && yarn tsc && yarn build:all` |
| `make build-dynamic` | Build static + export dynamic plugins via `@red-hat-developer-hub/cli` |
| `make pack` / `make pack-dynamic` | Create `.tgz` archives |
| `make publish` / `make publish-dynamic` | Publish to npm (skips already-published versions) |
| `make set-version VERSION=x.y.z` | Update version in all plugin `package.json` files |
| `make get-version` | Show latest published version from npm registry |
| `make unpublish` | Unpublish current version from npm |
| `make clean` | Remove `node_modules`, `dist`, `dist-dynamic`, logs, `.tgz` files |
| `make clean-dynamic` | Remove only `dist-dynamic/` directories |

### Root Makefile (run from repo root)

| Target | Purpose |
|--------|---------|
| `make help` | List the workspaces that have a Makefile |
| `make copy-dynamic-plugins` | Copy two built dynamic plugins to a local DevPortal checkout (`DEVPORTAL_BASE_PATH`) |
| `make echo-paths` | Show `DEVPORTAL_BASE_PATH` and `DYNAMIC_PLUGIN_ROOT` |

## Rules

Patterns and code samples live in `workspaces/dummy/AGENTS.md`. The rules they encode:

1. **Static vs dynamic.** Static plugins are registered in the hosting app (`packages/app/src/App.tsx`, `packages/backend/src/index.ts`). Dynamic plugins are exported with `@red-hat-developer-hub/cli plugin export` into `dist-dynamic/`, which is derived from `dist/` and never edited by hand.
2. **Identifiers.** A backend plugin's `pluginId` (from `createBackendPlugin`) sets its API path `/api/<pluginId>/`; a frontend plugin's `id` (from `createPlugin`) is its identity. Choose them once.
3. **Internal dependencies** use `workspace:^` (some workspaces `workspace:*`) and must be resolved to real versions before `npm publish`; see the `replace-workspace` target in `workspaces/github-workflows/Makefile`.
4. **Frontend tests** that reach a backend mock both `discoveryApiRef` and `fetchApiRef`. **Backend tests** use `startTestBackend` for the integration test and a mocked service for the router unit test.
5. **`--watchAll=false`** on every Jest run from the command line.
6. **Prove dynamic artifacts on a DevPortal container** before releasing them. Two harness generations exist: compose files at the workspace root (`dummy`, `about`, `kong-tools`) and a `dynamic/` folder (`github-workflows`, `gitlab-pipelines`, `kubernetes`). Use the one the workspace already has; the convergence is decided in the planning repository.

## Conventions

- **en-US** for every artifact: docs, agent files, decision records, commit messages.
- Every workspace carries a `README.md` (for humans), an `AGENTS.md` (for agents) and a thin `CLAUDE.md` that points at `AGENTS.md`. `workspaces/dummy/` holds the template for the pair.
- Workspace docs describe the code as it is. Status, roadmap and history belong in the planning repository.

## Key Constraints

1. **No root package.json** — each workspace is fully independent. Do not try to run `yarn` from the repo root.
2. **Always `cd` into a workspace first** — all `yarn` and `make` commands must run from within a workspace directory.
3. **`--watchAll=false` is mandatory** for CI/scripted test runs — Jest watch mode will hang.
4. **`ldap-auth` is static-only** — it does not support dynamic plugin export.
5. **Plugin IDs matter** — backend plugins use `pluginId` from `createBackendPlugin`, which determines the API path (`/api/<pluginId>/`). Frontend plugins use `id` from `createPlugin`.
6. **`workspace:^` dependencies** — must be resolved before npm publish. Some workspaces handle this via Makefile targets.
7. **No GitHub workflow runs the test suites** — `publish.yml` and `automated-update.yml` are the only workflows. Run tests locally before pushing.

## Reference Implementation

The **dummy workspace** (`workspaces/dummy/`) is the reference implementation (plugins ADR-0003): a catalogue of elements (frontend plugin, backend plugin, hosting app, Makefile, tests, container harness) that new workspaces assemble from, never copy wholesale. Read `workspaces/dummy/AGENTS.md` for the patterns and `workspaces/dummy/README.md` for the human-facing shape of a workspace.
