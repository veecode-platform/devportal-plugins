# AGENTS.md — marketplace workspace

Agent context for this workspace. Repository-wide rules, including the shape this file follows, are in the root [`AGENTS.md`](../../AGENTS.md).

## What the plugins do

The DevPortal marketplace: browsing plugins, collections and packages in the catalog, and recording changes to which plugins are installed. Five packages, all with unscoped npm names.

- `plugins/devportal-marketplace-backend` — `devportal-marketplace-backend`, backend, `pluginId: extensions`, so the API path is `/api/extensions/`. Serves collections, packages and plugins with their facets, plus installation endpoints. Described in its own source as a drop-in replacement for the RHDH extensions backend that removes the production-mode block, allowing install, enable and disable at any `NODE_ENV`.
- `plugins/devportal-marketplace-frontend` — `devportal-marketplace-frontend`, frontend, `pluginId: extensions`. The catalog and collection browsing UI. A fork of `redhat-developer/rhdh-plugins`, recorded in [`plugins/devportal-marketplace-frontend/UPSTREAM.md`](plugins/devportal-marketplace-frontend/UPSTREAM.md) with the upstream path, commit and a `diff` recipe.
- `plugins/devportal-pending-changes` — `devportal-pending-changes`, frontend, `pluginId: pending-changes`. Surfaces changes that are staged but not applied.
- `plugins/devportal-marketplace-frontend-dynamic` and `plugins/devportal-pending-changes-dynamic` — thin wrappers whose entire `src/index.ts` re-exports the package they wrap, which they depend on with `workspace:^`. They exist to carry the `export-dynamic` script and the Scalprum name (`devportal.marketplace-frontend` and `devportal.pending-changes`), so the wrapped packages stay plain libraries.

## Layout

```pre
workspaces/marketplace/
├── plugins/
│   ├── devportal-marketplace-backend/
│   │   └── src/
│   │       ├── router.ts                  # The REST surface
│   │       ├── plugin.ts                  # createBackendPlugin, pluginId extensions
│   │       ├── installation/              # InstallationDataService, file and database storage
│   │       ├── permissions/rules.ts
│   │       ├── validation/configValidation.ts
│   │       ├── errors/
│   │       └── utils/
│   ├── devportal-marketplace-frontend/
│   │   ├── UPSTREAM.md                    # Provenance
│   │   └── src/components/, src/utils/
│   ├── devportal-marketplace-frontend-dynamic/
│   ├── devportal-pending-changes/
│   └── devportal-pending-changes-dynamic/
├── backstage.json                         # 1.49.4
├── Makefile
├── AGENTS.md                              # This file
└── CLAUDE.md
```

There is **no hosting app**: this workspace has no `packages/` directory, even though its packages depend on each other. The root `package.json` has no `start` script for that reason.

## Commands

The `yarn` scripts at the workspace root cover `build:all`, `tsc`, `test`, `test:all`, `lint`, `lint:all`, `clean`, `fix` and `update-backstage`. There is no `yarn start`, because there is nothing to start.

The Makefile carries the standard targets (`build`, `build-dynamic`, `pack`, `pack-dynamic`, `publish`, `publish-dynamic`, `set-version`, `get-version`, `unpublish`, `clean`, `clean-dynamic`); `make help` lists them.

Per-package scripts are thinner than elsewhere: most packages have only `build`, `clean`, `tsc` and, where they export dynamically, `export-dynamic`. Only `devportal-marketplace-frontend` has a `test` script, and no package has `lint`.

## Architecture

- **The backend is the extensions plugin.** `createBackendPlugin({ pluginId: 'extensions' })` takes the usual core services plus `dynamicPluginsServiceRef` from `@backstage/backend-dynamic-feature-service`, which is how it knows which plugins the running instance has loaded. It reaches the catalog through `CatalogClient` and the shared `ExtensionsApi` / `ExtensionsCatalogClient` from `@red-hat-developer-hub/backstage-plugin-extensions-common`.
- **Read surface**: `GET /collections`, `/collections/facets`, `/collection/:namespace/:name`, `/collection/:namespace/:name/plugins`, `/packages`, `/packages/facets`, `/package/:namespace/:name`, `/plugins`, `/plugins/facets`, `/plugin/:namespace/:name`. Writes go through `POST` routes that drive installation.
- **Installation state** is abstracted behind `InstallationStorage`, with a file-backed and a database-backed implementation chosen at init, and coordinated by `InstallationDataService`.
- **The wrappers are pure re-exports.** Do not add logic to a `-dynamic` package; change the wrapped package instead.

## Testing

Only the frontend fork has tests, and they came with it:

```pre
plugins/devportal-marketplace-frontend/src/plugin.test.ts
plugins/devportal-marketplace-frontend/src/utils.test.ts
plugins/devportal-marketplace-frontend/src/utils/pluginProcessing.test.ts
plugins/devportal-marketplace-frontend/src/components/*.test.tsx
```

The backend, the pending-changes plugin and both wrappers have no tests. Run what exists with `yarn test:all` from the workspace root, always with `--watchAll=false` from a terminal.

## Dynamic loading

Three packages export dynamically: the backend and the two wrappers. There is **no container harness in this workspace**, so a dynamic artifact built here cannot be proven on a DevPortal image without borrowing another workspace's setup. The root `AGENTS.md` rule still applies: prove the artifact on a container before releasing it.

```sh
make build-dynamic
```

## Mocks and external dependencies

The catalog and the running instance's dynamic-plugin service are the dependencies, both reached through Backstage itself. There are no mock implementations and no `dev/` entry points in this workspace.

## Gotchas

- Package names are unscoped and carry no `publishConfig`, unlike the `@veecode-platform` packages elsewhere in the repository. Check what a publish would actually do before running one.
- Backend and frontend share `pluginId: extensions`; pending-changes uses `pending-changes`. The Scalprum names are only on the two wrappers.
- The frontend is a fork. Before changing it, read `UPSTREAM.md` and consider whether the change belongs upstream; the file includes the `diff` recipe for comparing against the pinned commit.
- With no hosting app, there is no way to run these plugins together locally from this workspace.
- `backstage.json` pins 1.49.4 while the DevPortal host declares 1.52.0. Moving to the host line is a planned milestone; do not bump ad hoc.

## Decisions

This workspace keeps no `DECISIONS.md`. If one is added, entries are plugin decision records numbered `PDR-001`, `PDR-002`, … and cited as `marketplace PDR-NNN`, never as ADRs. Cross-workspace decisions are `plugins ADR-NNNN` in the planning repository `veecode-platform/devportal-plugins-parent`. The provenance of the fork is `UPSTREAM.md`, not a decision record.
