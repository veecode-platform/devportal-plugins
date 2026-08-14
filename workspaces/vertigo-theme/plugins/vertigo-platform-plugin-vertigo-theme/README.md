# vertigo-platform-plugin-vertigo-theme

Vertigo DevPortal theme — a Backstage dynamic theme plugin that replaces the built-in light/dark
themes with **Vertigo Light** and **Vertigo Dark**, and mounts a small brand badge into the global
header.

Exports (wired via the dynamic-plugins `themes:` / `mountPoints:` config):

- `VertigoLightThemeProvider` — theme id `light`
- `VertigoDarkThemeProvider` — theme id `dark`
- `VertigoHeaderBadge` — mount point `global.header/component`

It also swaps the **favicon** on load (`src/branding/favicon.ts`). That is not a mount point or a
config key: the favicon is served from the image's `packages/app/public/`, and `app.branding` has no
favicon field, so the theme plugin rewrites the `<link rel="icon">` tags at runtime — the only way to
brand the tab without touching the image (ADR-003).

The sidebar logo is NOT the plugin's: it comes from `app.branding.fullLogo`/`iconLogo` in the
tenant's app-config (the M5 overlay ships the Vertigo PNGs through `filebase64()`).

Design scales live in `src/themes/tokens.ts` (single source of truth); the Vertigo palette in
`src/themes/palette.ts`; the surface-polish overrides in `src/themes/components.ts` via a
`makeComponents(mode)` factory; global CSS for the legacy MUI v4 layer in
`src/styles/component-fixes.css`.

## How the theme is built (RHDH 3.x contract)

The plugin does **not** hand-build a theme. It feeds a `ThemeConfig` into the very factory the
app-config route uses — `useThemeOptions` from `@red-hat-developer-hub/backstage-plugin-theme`
with `variant: 'rhdh'` — and merges the Vertigo layer on top:

```text
getDefaultThemeConfig(mode)          // RHDH defaults (palette + rhdh.general + type scale)
  ⊕ vertigo ThemeConfig              // palette.ts + Geist families            (deep merge)
  → createComponents(merged)         // RHDH component layer  ← carries the LAYOUT
  ⊕ makeComponents(mode)             // Vertigo surface polish (deep merge, Vertigo wins)
  → createUnifiedTheme(...)
```

**Why this and not `palette.rhdh.general.*` alone.** The 3.x shell's sidebar↔content layout lives
in RHDH's *component* layer, not in the palette. `createComponents` emits, among others:

| RHDH override                                              | What it does in the shell                                                     |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `BackstageSidebarPage.root` → `& nav ~ main {marginLeft:0}` | cancels the shell's own `marginLeft: 27px` (`Root.tsx:150`) on the content     |
| `BackstageSidebarPage.root` → `margin: pageInset`, `clipPath` | the PF6 page inset (measured: `margin-right: 24px`, `round 16px`)           |
| `BackstageSidebarPage.root` → inset background              | the band between drawer and content (`#f2f2f2` light / `#151515` dark)        |
| `BackstageSidebar.drawer` → `borderRight: 0.5rem solid <bg>` | extends the painted sidebar to the content edge                             |
| `BackstageSidebar.drawer` → `a[aria-current="page"]`        | selected item: bg from `rhdh.general`, label **and icon** from `navigation.selectedColor` |
| `MuiTabs` / `MuiTab` / `BackstageHeader`                    | tab indicator, selected tab colour, header treatment                          |

A bare `@backstage/theme` `createUnifiedTheme` emits none of it — that is exactly what the
`bs_1.54.0-next.0` tag shipped, and why it regressed: the 27px seam stayed uncompensated, the
selected sidebar icon was painted a blue almost equal to its own selected background in dark mode,
and tabs/header diverged from the reference render.

### Declared departures from the reference render

Everything above keeps the reference geometry. These are deliberate product decisions on top of it,
each one measured before/after and asserted in the parity gate:

| Departure | Why | Where |
| --- | --- | --- |
| content flush against the sidebar (`main` at x=224, not 251) | the shell hardcodes `marginLeft: 27px` (`Root.tsx:150`) and RHDH only cancels it on `main`, leaving a painted-less band | `RHDHPageWithoutFixHeight/sidebarLayout` override |
| drawer right border removed | RHDH adds `borderRight: 0.5rem` to stretch the sidebar across that band; with the content flush it would overlap the card | `BackstageSidebar/drawer` |
| square top corners on the content card | the card meets the page header band as one surface | `clipPath: inset(... round 0 0 1rem 1rem)` |
| brand surfaces instead of RHDH greys | `cardBackgroundColor`/`mainSectionBackgroundColor` default to `#292929` on dark | `rhdh.general.*` |
| page header band = branded navy wave | the RHDH default page theme paints a flat `linear-gradient(#292929)` on dark; the wave band is the VeeCode/Vertigo 2.x look | `pageTheme.default` (`shape: 'wave'`, resolved from `@backstage/theme`'s `shapes`) |
| sidebar hover = translucent wash; selected = deeper brand blue in light | the RHDH hover default is OPAQUE (`#ffffff` light / `#292929` dark) and hid the sidebar label; `#076cfe` read as harsh on navy | `navigation.navItem.hoverBackground`, `sidebarItemSelectedBackgroundColor` |
| app bar on the sidebar chrome, with forced light foreground | one dark frame; `appBarForegroundColor` is not read by `createComponents`, so the global-header icons need the override | `rhdh.general.appBar*` + `MuiAppBar` |

The palette carries the keys the M5 tenant overlay sets (`src/themes/palette.ts` documents
what is deliberately left to the RHDH defaults, and why). The `--bui-bg-app` body override in
`component-fixes.css` paints the exact brand canvas (`#f3f5f8` light / `#101820` dark) — the one
thing app-config cannot reach, and the only intentional deviation from the reference render.

`@red-hat-developer-hub/backstage-plugin-theme` is pinned to the exact version the shell image
carries (`0.14.7`): the plugin embeds its own copy (it is not in the shared scope), so a range would
let the plugin's layout layer drift from the shell's.

This makes the plugin the **single source of truth** for the Vertigo look on 3.x; the tenant
overlay must not stack an `app.branding.theme.*.palette` block on top (see DEVPORTAL-THEME.md).

### Parity gate

`_scratch/parity/check.mjs` builds both themes through the RHDH pipeline — once from the plugin's
config, once from the tenant overlay's app-config block — and asserts the palette, page themes and
every chrome/layout component slot are identical, that the Vertigo layer is still applied, and that
the selected sidebar item's icon colour differs from its background:

```bash
cd _scratch/parity && node --import ./register.mjs ./check.mjs
```

## Build

The dynamic artifact shipped to DevPortal is built with the RHDH CLI:

```bash
yarn export-dynamic   # rhdh-cli plugin export → dist-dynamic/
```

Do **not** use `backstage-cli package build` for the dynamic artifact — it breaks on the CSS
imports (self-hosted fonts + the v4-layer fixes imported in `src/index.ts`). Only
`rhdh-cli plugin export` bundles that CSS into the runtime artifact.
