# vertigo-platform-plugin-vertigo-theme

Vertigo DevPortal theme — a Backstage dynamic theme plugin that replaces the built-in light/dark
themes with **Vertigo Light** and **Vertigo Dark**, and mounts a small brand badge into the global
header.

Exports (wired via the dynamic-plugins `themes:` / `mountPoints:` config):

- `VertigoLightThemeProvider` — theme id `light`
- `VertigoDarkThemeProvider` — theme id `dark`
- `VertigoHeaderBadge` — mount point `global.header/component`

Design scales live in `src/themes/tokens.ts` (single source of truth); component overrides in
`src/themes/components.ts` via a `makeComponents(mode)` factory; global CSS for the legacy MUI v4
layer in `src/styles/component-fixes.css`.

## Build

The dynamic artifact shipped to DevPortal is built with the RHDH CLI:

```bash
yarn export-dynamic   # rhdh-cli plugin export → dist-dynamic/
```

Do **not** use `backstage-cli package build` for the dynamic artifact — it breaks on the CSS
imports (self-hosted fonts + the v4-layer fixes imported in `src/index.ts`). Only
`rhdh-cli plugin export` bundles that CSS into the runtime artifact.
