# AGENTS.md — vertigo-theme workspace

Agent context for this workspace. Repository-wide rules, including the shape this file follows, are in the root [`AGENTS.md`](../../AGENTS.md).

## What the plugins do

One frontend plugin, no backend, no hosting app.

- `plugins/vertigo-platform-plugin-vertigo-theme` — npm `vertigo-platform-plugin-vertigo-theme` (unscoped), `backstage.role: frontend-plugin`, `id: 'vertigo-theme'`. `src/plugin.ts` is a thin `createPlugin` shell that satisfies the `frontend-plugin` role and the RHDH export tooling; the payload is what `src/index.ts` exports:
  - `VertigoLightThemeProvider` and `VertigoDarkThemeProvider` (`src/providers.tsx`): `UnifiedThemeProvider` wrappers around `vertigoLight` and `vertigoDark`, written to replace the host's `light` and `dark` themes through the dynamic-plugins `themes:` block (`importName` plus `id: light` / `id: dark`).
  - `vertigoLight` and `vertigoDark` (`src/themes/`): `createUnifiedTheme` themes whose `palette` carries the RHDH 3.x layout contract `rhdh.general` (`sidebarBackgroundColor`, `sidebarItemSelectedBackgroundColor`, `appBarBackgroundScheme`, `appBarBackgroundColor`, `appBarForegroundColor`, `pageInset`) next to the Backstage `navigation` palette, a `genPageTheme` wave header for every page type, Geist Sans and `makeComponents(mode)`.
  - `VertigoHeaderBadge` (`src/components/VertigoHeaderBadge.tsx`): a brand pill built from MUI v5 `Box` and `Typography`, written for the `global.header/component` mount point.
  - `vertigoThemePlugin`: the plugin object itself.

## Layout

```pre
workspaces/vertigo-theme/
├── plugins/vertigo-platform-plugin-vertigo-theme/
│   ├── src/index.ts                   # Public exports; imports the Geist Sans CSS and component-fixes.css
│   ├── src/plugin.ts                  # createPlugin({ id: 'vertigo-theme' })
│   ├── src/providers.tsx              # VertigoLightThemeProvider, VertigoDarkThemeProvider
│   ├── src/components/VertigoHeaderBadge.tsx
│   ├── src/themes/tokens.ts           # Brand colors, chrome, hairline, radius, density, state, elevation
│   ├── src/themes/typography.ts       # defaultTypography + Geist Sans + h1–h6 scale
│   ├── src/themes/components.ts       # makeComponents(mode): MUI and Backstage overrides
│   ├── src/themes/vertigoLight.ts     # palette (with rhdh.general) + pageTheme + typography + components
│   ├── src/themes/vertigoDark.ts
│   ├── src/styles/component-fixes.css # Global CSS for the MUI v4 layer and the --bui-bg-app body variable
│   ├── src/assets.d.ts                # Module declarations for *.css, *.png, *.svg
│   └── README.md                      # Consumer doc
├── backstage.json                     # 1.49.4
├── Makefile                           # Standard targets for the single plugin
├── package.json                       # Yarn workspaces: plugins/*
├── AGENTS.md                          # This file
└── CLAUDE.md
```

Not present: `packages/` (no hosting app), `dev/`, test files, `app-config*.yaml`, a container harness, `DECISIONS.md`, a workspace-level `README.md`.

## Commands

Run from `workspaces/vertigo-theme/`. Standard `yarn` and `make` targets (root `AGENTS.md`), with these specifics:

| Command | Purpose |
|---------|---------|
| `yarn tsc` / `yarn build:all` / `yarn lint:all` | Type check, build and lint the single plugin |
| `yarn test:all` | `backstage-cli repo test --coverage`; there are no test files |
| `make build` | `yarn install && yarn tsc && yarn build:all` |
| `make build-dynamic` | `make build`, then deletes module-federation leftovers from `dist/` and runs `npx @red-hat-developer-hub/cli@latest plugin export` |
| `make pack` / `make pack-dynamic` | `npm pack` in the plugin / in its `dist-dynamic/` |
| `make publish` / `make publish-dynamic` | `npm publish --access public`; `publish` skips an already published version, `publish-dynamic` does not fail when npm refuses the dynamic variant |
| `make set-version VERSION=x.y.z` | Rewrites the version in the plugin `package.json`, then `yarn install` |
| `make get-version` / `make unpublish` / `make clean` / `make clean-dynamic` | As in the root `AGENTS.md` |

From `plugins/vertigo-platform-plugin-vertigo-theme/`: `yarn export-dynamic` (`rhdh-cli plugin export`) and `yarn export-dynamic:clean`. There is no `dev/` entry for the plugin's `yarn start` and no hosting app for the workspace's `yarn start`.

## Architecture

- **Tokens first.** `tokens.ts` holds every scale value (brand colors, `chrome`/`chromeDeep`, `hairline`/`hairlineDark`, `radius`, `density`, `state`, `elevation`/`elevationDark`) and imports nothing from MUI. `components.ts` and both theme files read from it; `components.ts` carries no scale literals.
- **One component language, two modes.** `makeComponents(mode)` returns `UnifiedThemeOptions['components']` and swaps hairline, shadow and hover overlay by mode. It includes `BackstageInfoCard` and `BackstageSidebarItem` overrides behind a cast because `@backstage/core-components` is not installed here, so those keys are untyped.
- **Palette as a separate const.** In `vertigoLight.ts` and `vertigoDark.ts` the `palette` object (with the `rhdh.general` block) is declared outside the `createUnifiedTheme` call so the extra `rhdh` key passes through without tripping TypeScript's excess-property check; MUI deep-merges unknown palette keys.
- **Two CSS escape hatches.** `src/index.ts` imports `@fontsource/geist-sans` weights 400 to 700 (self-hosted font files) and `src/styles/component-fixes.css`. The CSS file exists because `createUnifiedTheme` drops nested selectors when translating overrides to the MUI v4 layer, and because the `--bui-bg-app` body variable lives outside the MUI palette. `package.json` marks `**/*.css` as `sideEffects`.
- **Header chrome.** `MuiAppBar.colorPrimary` is pinned to `tokens.chrome` in both modes and recolors header controls by tag selector (`& button, & a, & svg`) because runtime MUI class names are prefixed with `v5-` and raw class selectors would not match.
- Legacy frontend system only (`createPlugin` from `@backstage/core-plugin-api`); there is no `alpha.ts` for the New Frontend System.

## Testing

No test files exist (`find plugins -name '*.test.*'` returns nothing), so `yarn test:all` and `yarn test --watchAll=false` run zero suites. The root `package.json` provisions Jest with jsdom. When adding tests, follow the frontend pattern in `workspaces/dummy/AGENTS.md`; nothing here calls a backend, so `discoveryApiRef`/`fetchApiRef` mocks are not needed. No GitHub workflow runs the suites; run them locally.

## Dynamic loading

No container harness in this workspace (no `docker-compose.yaml`, `dynamic-plugins.yaml` or `dynamic/`), and the root `Makefile`'s `copy-dynamic-plugins` covers other workspaces only. Export with `make build-dynamic` (or `yarn export-dynamic` in the plugin) into `plugins/vertigo-platform-plugin-vertigo-theme/dist-dynamic/`. The `scalprum` block names the remote `vertigo-platform.plugin-vertigo-theme` and exposes `PluginRoot` from `src/index.ts`.

Host-side wiring, as documented in the source comments (`providers.tsx`, `VertigoHeaderBadge.tsx`): two `themes:` entries (`importName: VertigoLightThemeProvider`, `id: light`; `importName: VertigoDarkThemeProvider`, `id: dark`) and a `mountPoints:` entry placing `VertigoHeaderBadge` at `global.header/component`. Nothing in this workspace renders the themes locally; prove the exported artifact on a DevPortal instance before releasing (root `AGENTS.md`, rule 6).

## Mocks and external dependencies

None. The plugin calls no API and has no backend. Fonts are bundled from `@fontsource/geist-sans` rather than fetched at runtime. There is no `dev/` entry point and no mock client.

## Gotchas

- `backstage.json` and the plugin's `backstage.supported-versions` say 1.49.4 while the DevPortal host declares 1.52.0 (plugins ADR-0004, 2026-09-10). Moving to the host line is the M6 host-line upgrade in the planning repository; do not bump ad hoc.
- The package is unscoped (`vertigo-platform-plugin-vertigo-theme`, no `@veecode-platform/` prefix), unlike most workspaces. `make publish` passes `--access public`.
- `src/index.ts` states that its CSS imports break `backstage-cli package build` (Rollup) and that only `rhdh-cli plugin export` bundles them, yet `make build-dynamic` depends on `make build`, which runs `backstage-cli repo build --all`. Confirm which holds before relying on `make build-dynamic`; `yarn export-dynamic` in the plugin skips the Rollup step.
- `VertigoHeaderBadge.tsx` imports `@mui/material`, which the plugin `package.json` does not declare; it resolves transitively through `@backstage/theme` (see `yarn.lock`). Keep that in mind before adding MUI v5 imports.
- Override rules that need nested selectors on MUI v4-rendered components (the catalog `UserListPicker`) go in `component-fixes.css` with `[class*="..."]` substring selectors; Backstage suffixes v4 class names, so an exact `.MuiCard-root` never matches.
- Source comments cite `_scratch/wcag-check.mjs`, `_scratch/future-proofing/bui-tokens.css` and `_scratch/VERIFICACAO-RUNTIME.md`; none of those files is in this repository.
- The plugin `README.md` is a consumer document; `package.json`, the `Makefile` and the sources are the authority for agent work where they disagree with it.

## Decisions

No `DECISIONS.md` in this workspace. If one is added, entries are plugin decision records (`PDR-NNN`), cited as `vertigo-theme PDR-NNN`. Cross-workspace decisions are `plugins ADR-NNNN` in the planning repository `veecode-platform/devportal-plugins-parent`.
