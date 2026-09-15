# AGENTS.md — veecode-theme workspace

Agent context for this workspace. Repository-wide rules are in the root [`AGENTS.md`](../../AGENTS.md); the section order follows the template in [`workspaces/dummy/AGENTS.md`](../dummy/AGENTS.md).

## What the plugins do

One frontend package and nothing else: no backend, no `-common` library, no hosting app.

- `plugins/veecode-platform-plugin-veecode-theme` — npm name `veecode-platform-plugin-veecode-theme` (unscoped), `backstage.role: frontend-plugin`, `id: 'veecode-theme'` (`src/plugin.ts`; also `backstage.pluginId`). Ships the VeeCode visual identity for Backstage: two `createUnifiedTheme` themes (`veecodeLight`, `veecodeDark` in `src/themes/`), two `UnifiedThemeProvider` wrappers (`VeecodeLightThemeProvider`, `VeecodeDarkThemeProvider` in `src/providers.tsx`) and a `--bui-*` token override for `@backstage/ui` surfaces (`src/styles/bui-tokens.css`). `src/index.ts` exports those four symbols plus `veecodeThemePlugin` and imports the CSS for its side effect.

The `createPlugin` call is a shell so the package satisfies the `frontend-plugin` role and the dynamic-plugin export tooling; the payload is the exported providers (comment in `src/plugin.ts`).

## Layout

```pre
workspaces/veecode-theme/
├── plugins/veecode-platform-plugin-veecode-theme/
│   ├── src/index.ts              # Public exports; side-effect import of the CSS
│   ├── src/plugin.ts             # createPlugin({ id: 'veecode-theme' })
│   ├── src/providers.tsx         # UnifiedThemeProvider wrappers for light and dark
│   ├── src/themes/               # veecodeLight.ts, veecodeDark.ts, shared components.ts
│   ├── src/styles/bui-tokens.css # --bui-bg-solid{,-hover,-pressed} for :root and [data-theme='dark']
│   ├── src/assets.d.ts           # Module declarations for *.css, *.png, *.svg
│   └── README.md                 # Consumer doc (see Gotchas)
├── backstage.json                # Backstage release (1.49.4)
├── package.json                  # Yarn workspaces: plugins/*; Node 20 or 22; Yarn 4 (.yarnrc.yml, node-modules linker)
├── tsconfig.json                 # Includes plugins/*/src, plugins/*/config.d.ts, plugins/*/dev
├── Makefile
├── AGENTS.md                     # This file
└── CLAUDE.md
```

Absent, compared with the standard shape in the root `AGENTS.md`: `packages/`, a plugin `dev/` folder, `app-config*.yaml`, `docker-compose.yaml`, `dynamic-plugins.yaml`, `dynamic/`, `config.d.ts`, tests.

## Commands

Run from `workspaces/veecode-theme/`. The root `package.json` carries the standard scripts (`yarn tsc`, `yarn build:all`, `yarn test:all`, `yarn lint:all`, `yarn update-backstage`); there is no `packages/app` for `yarn start` to launch and no `dev/` entry point in the plugin.

| Command | Purpose |
|---------|---------|
| `make build` | `yarn install && yarn tsc && yarn build:all` |
| `make build-dynamic` | `make build`, then delete module-federation leftovers from `dist/` and run `npx @red-hat-developer-hub/cli@latest plugin export` in the plugin (`YARN_ENABLE_IMMUTABLE_INSTALLS=false`) |
| `make pack` / `make pack-dynamic` | `npm pack` in the plugin / in its `dist-dynamic/` |
| `make publish` | `make build`, then `npm publish --access public` unless `<name>@VERSION` is already on the registry |
| `make publish-dynamic` | `make build-dynamic`, then `npm publish --access public` from `dist-dynamic/`; a failed publish does not fail the target and nothing checks whether the version already exists |
| `make set-version VERSION=x.y.z` | Rewrite the version in the plugin `package.json`, then `yarn install` |
| `make get-version` / `make unpublish` | Query the registry for the latest version / remove `<name>@VERSION` |
| `make clean` / `make clean-dynamic` | Everything including `node_modules` / only `dist-dynamic/` |

From the plugin directory: `yarn tsc`, `yarn build`, `yarn lint`, `yarn export-dynamic` (`rhdh-cli plugin export`) and `yarn export-dynamic:clean` (same with `--clean`). `VERSION` has a default inside the Makefile; pass it explicitly to `publish`, `unpublish` and `set-version`. `NPM_REGISTRY=<url>` adds `--registry` to every npm call.

## Architecture

- Both themes start from `@backstage/theme` `palettes.light` / `palettes.dark`, set `primary`, `secondary` and `navigation` colors, build page headers with `genPageTheme` (`shapes.wave`; `shapes.wave2` for `documentation`) and share one `components` object of MUI `styleOverrides.root` tweaks for `MuiButton`, `MuiTab`, `MuiCard` and `MuiChip` (`src/themes/components.ts`, whose header asks for `styleOverrides.root` over deep class-key selectors).
- The providers wrap `UnifiedThemeProvider`. Comments in `src/plugin.ts` and `src/providers.tsx` describe the host-side wiring: a dynamic-plugin `themes:` entry with `importName: VeecodeLightThemeProvider` / `VeecodeDarkThemeProvider` and `id: light` / `id: dark`, so the host replaces its like-id built-in themes. That configuration lives in the host, not in this workspace.
- `bui-tokens.css` is imported from `src/index.ts` so it ships inside the Module-Federation bundle and loads after the host's static `@backstage/ui` stylesheet, winning on cascade order (file header). `package.json` lists `**/*.css` under `sideEffects` so bundlers keep the import.
- `package.json` `scalprum`: `name: veecode-platform.plugin-veecode-theme`, `exposedModules.PluginRoot: ./src/index.ts`. `main` / `types` point at `src/index.ts`; `publishConfig` switches them to `dist/`, and `files` publishes only `dist`.
- Dependencies: `@backstage/core-plugin-api`, `@backstage/theme`; peers `@material-ui/core` 4 and `react` / `react-dom` 18. No backend call, no API ref, no config schema.

## Testing

No test files exist (`find plugins -name '*.test.*'` returns nothing) and there is no hosting app or e2e setup. The Jest toolchain is in the root `devDependencies` (`jest`, `@types/jest`, `jsdom`, `@jest/environment-jsdom-abstract`) and `yarn test:all` runs `backstage-cli repo test --coverage`. When adding a test, place it next to the source (`src/plugin.test.ts`, `src/themes/*.test.ts`) and run `yarn test --watchAll=false` from the plugin.

## Dynamic loading

`yarn export-dynamic` in the plugin, or `make build-dynamic` from the workspace, runs the Red Hat Developer Hub CLI `plugin export` and writes `dist-dynamic/` (gitignored, and ignored by ESLint together with `dist-scalprum`). The exported package takes the `-dynamic` suffix, so the artifact is `veecode-platform-plugin-veecode-theme-dynamic` (plugin README naming note; same convention as the dummy harness mount paths). `dist-dynamic/` is derived from `dist/`; never edit it by hand.

There is no container harness here: no `docker-compose.yaml`, `dynamic-plugins.yaml`, `app-config.dynamic.yaml` or `dynamic/` folder. Root `AGENTS.md` rule 6 still applies: prove the artifact on a DevPortal container before releasing it, borrowing a harness from a workspace that has one and adding the `themes:` entry described in the source comments.

## Mocks and external dependencies

None. The plugin calls no backend and reads no config; it needs only `@backstage/theme`, `@backstage/core-plugin-api` and the host's MUI 4 / React 18 peers. There is no `dev/` entry point and no hosting app, so nothing in this workspace renders the theme locally. The `--bui-*` overrides depend on `@backstage/ui` token names, which the CSS header says were read from a 0.13.2 build while the app resolved `^0.14`; re-check them against the host's resolved `@backstage/ui/dist/css/styles.css` before relying on them.

## Gotchas

- `backstage.json` says 1.49.4 (matching `backstage.supported-versions` in the plugin) while the DevPortal host declares 1.52.0. Moving workspaces onto the host line is planned in the planning repository (ADR-0004; dummy first in M6, the others follow); do not bump ad hoc. `yarn update-backstage` bumps to latest, unpinned.
- The sources used to cite an `ADR-011` ("frontend design system") that exists in no repository. The mechanism it described is recorded in [`DECISIONS.md`](DECISIONS.md) as `veecode-theme PDR-001`, and the four source comments now cite that. Its "phase 1" and "phase E" numbering is deliberately not carried over: the phase plan lived in the missing document.
- The config file named in the `src/plugin.ts` and `src/providers.tsx` comments belongs to a retired enablement path from a repository that no longer exists. Follow the Makefile and the `export-dynamic` script instead, and read `PDR-001` for the mechanism; do not copy those steps into other docs.
- `src/index.ts` states that the CSS import breaks `backstage-cli package build` (Rollup) and that `export-dynamic` needs only `tsc`. `make build-dynamic` nevertheless depends on `make build`, which runs `yarn build:all`. This file does not verify either claim; check the actual behavior before relying on those targets.
- Names are load-bearing and differ from the scoped `@veecode-platform/...` packages elsewhere in the repository: the npm name is unscoped (`veecode-platform-plugin-veecode-theme`), the scalprum name uses a dot (`veecode-platform.plugin-veecode-theme`), the plugin id is `veecode-theme`. Renaming any of them renames the dynamic artifact or the host config key.
- `make build-dynamic` deletes `remoteEntry.js`, `mf-manifest.json`, `mf-stats.json`, `@mf-types` and `compiled-types` from `dist/` before exporting, as dummy does; keep that step.
- `make publish-dynamic` swallows a failed `npm publish`, so a green run does not prove the dynamic artifact was published. Read the output.

## Decisions

Design decisions live in [`DECISIONS.md`](DECISIONS.md) as plugin decision records, cited elsewhere as `veecode-theme PDR-NNN`, never as ADRs. `PDR-001` records the three mechanisms that govern how this theme reaches a portal (delivery as a dynamic plugin, replacement by id collision, and brand CSS shipped inside the bundle) together with the current implementation's known limitations. New entries start at `PDR-002`.

Cross-workspace decisions are `plugins ADR-NNNN` in the planning repository `veecode-platform/devportal-plugins-parent`; product decisions about the theme, including whether a host enables it by default, live there.
