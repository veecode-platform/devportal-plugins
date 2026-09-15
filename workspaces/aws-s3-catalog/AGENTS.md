# AGENTS.md — aws-s3-catalog workspace

Agent context for this workspace. Repository-wide rules are in the root [`AGENTS.md`](../../AGENTS.md); the section order follows the template in [`workspaces/dummy/AGENTS.md`](../dummy/AGENTS.md).

## What the plugins do

One package, no hosting app.

- `plugins/aws-s3-catalog-module` — `@aws/aws-s3-catalog-module-for-backstage`, `backstage.role: backend-plugin-module` for `pluginId: 'catalog'` (`pluginPackage: @backstage/plugin-catalog-backend`). Its whole source is `src/index.ts`, which re-exports the default export of `@backstage/plugin-catalog-backend-module-aws`, the upstream Backstage module for AWS S3 catalog discovery. The package exists to be exported as a dynamic plugin: its description reads "Dynamic-plugin wrapper for Backstage AWS S3 catalog discovery" and it carries an `export-dynamic` script.

The package was vendored from `awslabs/backstage-plugins-for-aws` through the retired fork `veecode-platform/backstage-plugins-for-aws` (commit `cf408c11`), Apache-2.0, copyright Amazon.com, Inc. or its affiliates. `plugins/aws-s3-catalog-module/NOTICE` is the provenance record and `src/index.ts` keeps the Amazon license header; leave both as they are.

## Layout

No `packages/`, no Makefile, no README, no `app-config.yaml`, no container harness, no `dev/` entry point, no tests.

```pre
workspaces/aws-s3-catalog/
├── plugins/
│   └── aws-s3-catalog-module/
│       ├── src/index.ts          # The only source file: re-export of the upstream module
│       ├── NOTICE                # Provenance (vendored, Apache-2.0)
│       ├── .eslintrc.js          # @backstage/cli eslint-factory
│       ├── .gitignore            # dist-dynamic/
│       └── package.json          # build, lint, clean, export-dynamic, export-dynamic:clean
├── .yarn/releases/               # Yarn 4 binary referenced by .yarnrc.yml (nodeLinker: node-modules)
├── backstage.json                # 1.49.2
├── package.json                  # aws-s3-catalog-workspace; Yarn workspaces = plugins/*
├── tsconfig.json                 # Extends @backstage/cli's; still lists packages/* paths, which do not exist here
├── yarn.lock
├── AGENTS.md                     # This file
└── CLAUDE.md                     # Thin pointer here
```

## Commands

Run from `workspaces/aws-s3-catalog/`. The Makefile tables in the root `AGENTS.md` do not apply: there is no Makefile and no `yarn start`.

| Command | Purpose |
|---------|---------|
| `yarn install` | Install (Yarn 4 through `.yarnrc.yml`) |
| `yarn tsc` / `yarn tsc:full` | Type check; `tsc:full` disables `skipLibCheck` and incremental mode |
| `yarn build:all` | `backstage-cli repo build --all` |
| `yarn test` / `yarn test:all` | `backstage-cli repo test` (the second with `--coverage`); nothing to run today, see Testing |
| `yarn lint` / `yarn lint:all` | `backstage-cli repo lint` since `origin/main` / everything |
| `yarn clean` | `backstage-cli repo clean` |
| `yarn update-backstage` | `backstage-cli versions:bump`, unpinned (see Gotchas before using it) |

From `plugins/aws-s3-catalog-module/`: `yarn build`, `yarn lint`, `yarn clean`, `yarn export-dynamic` (`rhdh-cli plugin export --embed-package @backstage/plugin-catalog-backend-module-aws`) and `yarn export-dynamic:clean` (the same with `--clean`). The package has no `test` and no `start` script.

## Architecture

- The package is a one-line re-export: `export { default } from '@backstage/plugin-catalog-backend-module-aws';`. It declares no `config.d.ts`, so configuration is whatever the upstream module reads; nothing in this workspace touches AWS directly.
- `main` and `types` point at `src/index.ts` for development; `publishConfig` switches them to `dist/index.cjs.js` and `dist/index.d.ts`, and `files` ships only `dist`.
- `export-dynamic` passes `--embed-package @backstage/plugin-catalog-backend-module-aws` to `rhdh-cli plugin export`, so the upstream module is embedded in the exported artifact. Output lands in `dist-dynamic/`, gitignored by the package's `.gitignore`; `dist` and `dist-types` are gitignored at the workspace root.
- Static loading is not exercised here: there is no hosting `packages/backend` to `backend.add(...)` the module into.

## Testing

`find plugins -name '*.test.*'` returns nothing: the package has no tests and no `test` script. The workspace-level `yarn test` and `yarn test:all` run `backstage-cli repo test` over an empty set. If tests are added, follow the root rules: backend tests go through `startTestBackend` (`@backstage/backend-test-utils`) and every command-line run passes `--watchAll=false`. No GitHub workflow runs test suites; run them locally.

## Dynamic loading

What exists: `yarn export-dynamic` in `plugins/aws-s3-catalog-module/` produces `dist-dynamic/` with the upstream module embedded. `rhdh-cli` comes from the package's `@red-hat-developer-hub/cli` devDependency.

What does not: there is no `docker-compose.yaml`, `dynamic-plugins.yaml`, `app-config.dynamic.yaml` or `dynamic/` folder. The root `AGENTS.md` (rule 6) requires proving dynamic artifacts on a DevPortal container before release, and this workspace has no harness for that yet; the planning repository (standard 01) records the gap. Until one lands, use a harness from another workspace (`workspaces/dummy/docker-compose.yaml` or a `dynamic/` folder) pointed at this package's `dist-dynamic/`.

## Mocks and external dependencies

- External dependency: AWS S3, reached by the upstream `@backstage/plugin-catalog-backend-module-aws`; this workspace holds no AWS client, credential or configuration of its own.
- No mocks and no `dev/` entry point; there is nothing to run standalone.

## Gotchas

- **Scope.** The package is not `private` and has `publishConfig.access: public`, but it sits under the `@aws` scope and its `repository` field still points at `github:awslabs/backstage-plugins-for-aws` (`plugins/core/catalog-aws-s3`). Publishing under someone else's scope is not possible from VeeCode's npm account (planning repository, plugin inventory). Do not read `publishConfig` as proof the package can be published from here.
- **Backstage line.** `backstage.json` says 1.49.2 while the DevPortal host declares 1.52.0 (planning repository ADR-0004, 2026-09-10). Moving to the host line is planned there; do not bump ad hoc. `yarn update-backstage` runs `versions:bump` without `--release`, so it bumps to latest, not to the host line.
- **Exporter on `latest`.** `@red-hat-developer-hub/cli` is declared as `latest`, so the `rhdh-cli` behind `export-dynamic` is whatever `yarn install` resolved that day.
- **Two `@backstage/cli` ranges.** The workspace root and the package declare different `@backstage/cli` ranges; keep them in step when bumping.
- **`resolutions`.** The workspace `package.json` pins `fast-xml-parser` through `resolutions`; the reason is not recorded in this workspace. Check `yarn.lock` before dropping it.
- **Provenance.** `NOTICE` and the Amazon header in `src/index.ts` are the vendoring record. Keep them intact when editing the package.

## Decisions

No `DECISIONS.md` in this workspace. If one is added, entries are plugin decision records (`PDR-NNN`), cited as `aws-s3-catalog PDR-NNN`. Cross-workspace decisions are `plugins ADR-NNNN` in the planning repository `veecode-platform/devportal-plugins-parent`.
