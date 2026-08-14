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

## RHDH 3.x contract (`palette.rhdh.general`)

Rebuilt against the 3.x app-shell layout contract. The shell (`devportal-core-main/packages/app`)
does layout arithmetic with `theme.palette.rhdh.general.*`, which the old-generation
`createUnifiedTheme` form (only `primary`/`secondary`/`navigation.*`) never emitted — mounting it
reproduced the sidebar↔content gap, the Administration-expand shift and the full-height loader.

Both themes now carry a `rhdh.general` block with Vertigo values for the fields the shell reads
(see `src/themes/vertigoLight.ts` for the full rationale and field-by-field mapping):

| Field | Light | Dark | Shell consumer |
| --- | --- | --- | --- |
| `sidebarBackgroundColor` | `#161d2e` (chrome) | `#161d2e` | `ResizableDrawer.tsx` (drawer paper) |
| `sidebarItemSelectedBackgroundColor` | `#076cfe` (brand blue) | `#4d94ff` | `CustomSidebarItem.tsx` / `useThemedConfig.ts` |
| `appBarBackgroundScheme` | `dark` | `dark` | `useThemedConfig.ts` (logo variant) |
| `appBarBackgroundColor` / `Foreground` | navy `#0c1557` / `#ffffff` | same | app bar |
| `pageInset` | `1.5rem` | `1.5rem` | `Root.tsx` (docked-drawer margin calc) |

The `palette` object is kept as a separate const so the extra `rhdh` key passes through
`createUnifiedTheme` untouched (MUI `createPalette` deep-merges unknown palette keys); an inline
literal would trip the TS excess-property check. `navigation.background` stays set to the same
chrome — the main left sidebar background comes from core-components `Sidebar` reading
`navigation.background`, while `rhdh.general.sidebarBackgroundColor` feeds the RHDH drawer and the
app-config contract. The `--bui-bg-app` body override in `component-fixes.css` paints the exact
brand canvas (`#f3f5f8` light / `#101820` dark) — the one thing app-config cannot reach.

This makes the plugin the **single source of truth** for the Vertigo look on 3.x; the tenant
overlay must not stack an `app.branding.theme.*.palette` block on top (see DEVPORTAL-THEME.md).

## Build

The dynamic artifact shipped to DevPortal is built with the RHDH CLI:

```bash
yarn export-dynamic   # rhdh-cli plugin export → dist-dynamic/
```

Do **not** use `backstage-cli package build` for the dynamic artifact — it breaks on the CSS
imports (self-hosted fonts + the v4-layer fixes imported in `src/index.ts`). Only
`rhdh-cli plugin export` bundles that CSS into the runtime artifact.
