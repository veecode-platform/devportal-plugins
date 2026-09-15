# AGENTS.md — veecode-homepage workspace

Agent context for this workspace. Repository-wide rules, including the shape this file follows, are in the root [`AGENTS.md`](../../AGENTS.md).

## What the plugins do

- `plugins/veecode-homepage` — `@veecode-platform/plugin-veecode-homepage`, frontend, `id: veecode-homepage`. The DevPortal home page: a greeting, a header, the home content and a user avatar, built on `@backstage/plugin-home`. It registers `visitsApiRef` with a `VisitsStorageApi` built from the storage and identity APIs, ships translations, and re-exports `VisitListener` from `@backstage/plugin-home`.
- `plugins/mui4-test` and `plugins/mui5-test` — `@red-hat-developer-hub/backstage-plugin-mui4-test` and `-mui5-test`, frontend helper plugins under a third-party scope, used to exercise MUI v4 and MUI v5 rendering behaviour. They are development aids, not product plugins.

## Layout

```pre
workspaces/veecode-homepage/
├── packages/app, packages/backend    # Hosting app
├── plugins/
│   ├── veecode-homepage/
│   │   └── src/
│   │       ├── plugin.ts             # createPlugin, visitsApiRef factory, translations
│   │       ├── alpha.ts              # Re-exports the translations
│   │       ├── index.ts              # Exports plugin, alpha and VisitListener
│   │       ├── routes.ts
│   │       ├── components/           # VeeCodeHomePage, headerComponent, homeContent,
│   │       │                         #   homeGretting, userAvatar
│   │       ├── hooks/, utils/, assets/, translations/
│   │       ├── report.api.md         # Generated
│   │       └── knip-report.md        # Generated
│   ├── mui4-test/
│   └── mui5-test/
├── examples/                         # Catalog entities for local runs
├── catalog-info.yaml                 # create-app placeholder
├── playwright.config.ts
├── backstage.json                    # 1.49.2
├── Makefile
├── README.md, AGENTS.md, CLAUDE.md
└── app-config.yaml, app-config.production.yaml
```

## Commands

The standard `yarn` and `make` targets described in the root `AGENTS.md`, plus `yarn test:e2e` for Playwright. Two targets are specific to this workspace:

| Target | Purpose |
|--------|---------|
| `make patch-mui-styles-version` | Writes a `version` field into `node_modules/@mui/material/styles/package.json`, copying it from the MUI root manifest |
| `make build-dynamic` | Depends on `build` **and** on the patch above before running the export |

The homepage plugin's export script is named `build-dynamic-plugin`, not `export-dynamic`.

## Architecture

- `VeeCodeHomePage` composes the home page from the components under `src/components/`; the building blocks come from `@backstage/plugin-home`.
- The plugin registers `visitsApiRef` itself, with `VisitsStorageApi.create({ storageApi, identityApi })`. It also re-exports `VisitListener` explicitly, because the 3.x shell does not mount one and nothing in this package references it, so the dynamic build would otherwise tree-shake it out and the visited cards would stay empty.
- `src/alpha.ts` re-exports the translations; the plugin itself uses the legacy frontend system.
- The two MUI test plugins are independent and wired only for local experimentation.

## Testing

```pre
plugins/veecode-homepage/src/plugin.test.ts
plugins/veecode-homepage/src/utils/stringUtils.test.tsx
plugins/mui4-test/src/plugin.test.ts
plugins/mui5-test/src/plugin.test.ts
packages/app/src/App.test.tsx
packages/app/e2e-tests/app.test.ts
```

Coverage is thin: the components have no tests. Add them next to the component when you touch one. Always pass `--watchAll=false` from a terminal.

## Dynamic loading

There is **no container harness in this workspace**: no compose file and no `dynamic/` folder. `make build-dynamic` produces `plugins/veecode-homepage/dist-dynamic/`, and the repository-root `make copy-dynamic-plugins` copies that folder into a local DevPortal checkout, which is the only loading path wired up from here. The root `AGENTS.md` rule still applies: prove the artifact on a container before releasing it.

## Mocks and external dependencies

None external. The home page renders from the catalog and the identity of the signed-in user, both provided by the hosting app. There are no mock implementations and no `dev/` entry points.

## Gotchas

- Without `patch-mui-styles-version`, the export fails for anything importing from `@mui/material/styles` (for example `@mui/x-charts`) with "No version specified and unable to automatically determine one", because MUI's subpath manifests omit `version`. That is why `build-dynamic` depends on it. The patch edits `node_modules`, so it has to run again after a fresh install.
- The export script is `build-dynamic-plugin` here and in `global-header`, while dummy and most others use `export-dynamic`. Scripts that assume one name will miss this workspace.
- `backstage.pluginPackages` in the homepage `package.json` lists `@backstage/plugin-home`, the upstream package, rather than this one.
- `plugin.ts` writes to the console at module scope and when creating the visits API. Those lines reach the browser console of any app that loads the plugin.
- The two `-test` plugins sit under the `@red-hat-developer-hub` scope, which VeeCode cannot publish to. Treat them as local-only.
- `report.api.md` and `knip-report.md` are generated; do not hand-edit them.
- `catalog-info.yaml` is the `create-app` placeholder. Its fate is decided in the planning repository; do not fill it in ad hoc.
- `backstage.json` pins 1.49.2 while the DevPortal host declares 1.52.0. Moving to the host line is a planned milestone; do not bump ad hoc.

## Decisions

This workspace keeps no `DECISIONS.md`. If one is added, entries are plugin decision records numbered `PDR-001`, `PDR-002`, … and cited as `veecode-homepage PDR-NNN`, never as ADRs. Cross-workspace decisions are `plugins ADR-NNNN` in the planning repository `veecode-platform/devportal-plugins-parent`.
