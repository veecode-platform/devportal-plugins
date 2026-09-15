# AGENTS.md — ai-resources workspace

Agent context for this workspace. Repository-wide rules, including the shape this file follows, are in the root [`AGENTS.md`](../../AGENTS.md).

## What the plugins do

One package, no hosting app.

- `plugins/catalog-backend-module-ai-resources` — `@veecode-platform/backstage-plugin-catalog-backend-module-ai-resources`, backend plugin module (`backstage.role: backend-plugin-module`) for the `catalog` plugin: `createBackendModule({ pluginId: 'catalog', moduleId: 'ai-resources' })`. It registers Backstage core's `AiResource` entity kind (`apiVersion: backstage.io/v1alpha1`, spec types `skill` and `rule`) and the `McpServer` API model by adding `aiResourceEntityModel` and `mcpServerApiEntityModel` from `@backstage/catalog-model/alpha` to the catalog's `catalogModelExtensionPoint` (`src/module.ts`). Registration-only: schemas, validators and the `ownedBy`/`partOf` relations come from the host's `@backstage/catalog-model`; the package adds no vocabulary of its own.
- `src/index.ts` re-exports the module as the package default export, the shape `backend.add(import(...))` consumes (see the dummy backend pattern).

The package is public (`publishConfig.access: public`, `files: ["dist"]`). [`plugins/catalog-backend-module-ai-resources/README.md`](plugins/catalog-backend-module-ai-resources/README.md) is the consumer doc: enabling the module also requires `AiResource` in `catalog.rules`, and it shows an example entity.

## Layout

```pre
workspaces/ai-resources/
├── plugins/
│   └── catalog-backend-module-ai-resources/
│       ├── src/module.ts             # createBackendModule; registers the two model layers
│       ├── src/index.ts              # Default export of the module
│       ├── README.md                 # Consumer doc: catalog.rules, example entity
│       ├── package.json
│       ├── tsconfig.json
│       └── .eslintrc.js
├── .yarn/releases/yarn-4.12.0.cjs    # Pinned Yarn (.yarnrc.yml yarnPath, package.json packageManager)
├── .yarnrc.yml                       # nodeLinker: node-modules
├── backstage.json                    # 1.52.0
├── package.json                      # Workspace root: scripts, Yarn workspaces plugins/*
├── tsconfig.json
├── yarn.lock
├── AGENTS.md                         # This file
└── CLAUDE.md                         # Thin pointer here
```

Absent, unlike the standard shape in the root `AGENTS.md`: `packages/` (no hosting app), `Makefile`, `app-config*.yaml`, `docker-compose.yaml`, `dynamic-plugins.yaml`, `dynamic/`, `DECISIONS.md`, a workspace `README.md`, and any `dev/`, `config.d.ts` or test file inside the plugin.

## Commands

There is no Makefile and no hosting app, so none of the `make` targets and none of the `yarn start` (hosting app) or `yarn update-backstage` scripts listed in the root `AGENTS.md` exist here. What does exist, from `workspaces/ai-resources/` (`package.json`):

| Command | Purpose |
|---------|---------|
| `yarn install` | Install (Yarn 4.12.0 through `packageManager` and `.yarn/releases`; Node 20 or 22 per `engines`) |
| `yarn tsc` / `yarn tsc:full` | Type check; `tsc:full` runs with `--skipLibCheck false --incremental false` |
| `yarn build:all` | `backstage-cli repo build --all` |
| `yarn test` / `yarn test:all` | `backstage-cli repo test`, with `--coverage` for `test:all` |
| `yarn lint` / `yarn lint:all` | `backstage-cli repo lint --since origin/main` / whole workspace |
| `yarn fix`, `yarn prettier:check`, `yarn clean`, `yarn new` | `backstage-cli repo fix`, `prettier --check .`, `backstage-cli repo clean`, `backstage-cli new` |

From `plugins/catalog-backend-module-ai-resources/`: `yarn build`, `yarn tsc`, `yarn lint`, `yarn test --watchAll=false` (or `yarn test:ci`, which is `backstage-cli package test --watch false`) and `yarn clean`. `prepack`/`postpack` run `backstage-cli package prepack`/`postpack`, so `npm pack`/`npm publish` ship `dist/` with the `publishConfig` entry points. A `start` script (`backstage-cli package start`) is declared, but there is no `dev/` entry point (see Gotchas).

Publishing: `.github/workflows/publish.yml` reads `VERSION` from the workspace `Makefile` and runs `make set-version`, `make publish` and `make publish-dynamic`; with no Makefile, this workspace cannot be released through that workflow. `.github/workflows/automated-update.yml` selects every `workspaces/*/package.json`, so it does include this workspace; its export step is conditional on a Makefile `build-dynamic` target and is skipped here (`.claude/commands/ci/upgrade-workspace.md`).

## Architecture

- A backend module, not a backend plugin: `createBackendModule` with `pluginId: 'catalog'` and `moduleId: 'ai-resources'`. It owns no router, no API path and no configuration. Its only dependency is `catalogModelExtensionPoint` from `@backstage/plugin-catalog-node/alpha`.
- `init` calls `model.addModelSource(CatalogModelSources.static([aiResourceEntityModel, mcpServerApiEntityModel]))`. Both models and `CatalogModelSources` come from `@backstage/catalog-model/alpha`.
- `@backstage/catalog-model` is pinned `~1.9.0` and `@backstage/plugin-catalog-node` `~2.2.2`. The comment in `src/module.ts` explains the tilde on catalog-model: it tracks the model version verified against the running image, so the embedded copy can never register schemas the host does not otherwise carry.
- Mirrors upstream `@backstage/plugin-catalog-backend-module-ai-model` (stated in `src/module.ts`).

## Testing

No test files exist (`find plugins -name '*.test.*'` returns nothing) and there is no hosting app, so nothing exercises the module in this workspace. The stack is in place: `@backstage/backend-test-utils` is a plugin devDependency, `jest` and `@types/jest` sit at the workspace root, and `yarn test` / `yarn test:ci` are wired. When adding a test, start from the dummy backend integration pattern (`startTestBackend` from `@backstage/backend-test-utils`) and always pass `--watchAll=false`. No GitHub workflow runs test suites on push; the automated update runs `yarn test --watchAll=false` per workspace as a non-blocking validation step.

## Dynamic loading

Nothing here: no `Makefile` (so no `make build-dynamic`), no `export-dynamic` script, no `dist-dynamic/`, and no `docker-compose.yaml`, `dynamic-plugins.yaml` or `dynamic/` harness. `.gitignore` already lists `dist-dynamic` and `dist-scalprum`, but no target produces them. Root rule 6 (prove dynamic artifacts on a DevPortal container before releasing) cannot be met from this workspace alone; the harness choice is decided in the planning repository.

## Mocks and external dependencies

None. The module has no external service, no configuration schema (`config.d.ts` is absent) and no mock: it only wires two model layers the host's `@backstage/catalog-model` already ships. The runtime prerequisite is on the deployment side: `AiResource` must be allowed in `catalog.rules` (plugin README).

## Gotchas

- No hosting app (`packages/` absent), no `Makefile`, no `export-dynamic` or `update-backstage` script, no `app-config*.yaml`. The root `AGENTS.md` names this among the five single-package workspaces. Do not invent the missing targets and do not run `make` here.
- `publish.yml` cannot release this workspace: it needs `VERSION` in a workspace `Makefile` plus the `set-version`, `publish` and `publish-dynamic` targets.
- `yarn start` is declared in the plugin, but there is no `dev/` directory; the root `tsconfig.json` `include` entries for `plugins/*/dev` and `plugins/*/config.d.ts` match nothing today.
- The tilde pins on `@backstage/catalog-model` (`~1.9.0`) and `@backstage/plugin-catalog-node` (`~2.2.2`) are deliberate (`src/module.ts`). The automated update runs `backstage-cli versions:bump` in every workspace with a `package.json`, this one included; review any change to those two ranges against the host image before merging.
- `aiResourceEntityModel`, `mcpServerApiEntityModel`, `CatalogModelSources` and `catalogModelExtensionPoint` are only available from the `/alpha` entry points of their packages.
- `backstage.json` says 1.52.0, the release the DevPortal host declares (see dummy's Gotchas).
- The plugin README and `src/module.ts` cite `devportal-planning ADR-007`. That is a different ADR series from `plugins ADR-NNNN`; leave the citation exactly as written.

## Decisions

No `DECISIONS.md` in this workspace. If one is added, entries are plugin decision records (`PDR-NNN`), cited as `ai-resources PDR-NNN`. Cross-workspace decisions are `plugins ADR-NNNN` in the planning repository `veecode-platform/devportal-plugins-parent`. The record behind this module is `devportal-planning ADR-007`, as cited in `src/module.ts` and the plugin README; it belongs to a separate series and is not a `plugins ADR`.
