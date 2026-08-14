import type { ThemeConfig } from '@red-hat-developer-hub/backstage-plugin-theme';
import { tokens, type ThemeMode } from './tokens';

/*
 * Vertigo palette — PARITY LAYER.
 *
 * These are exactly the keys the M5 tenant overlay sets under
 * `app.branding.theme.{light,dark}.palette` (wt-m5-platform-infra
 * manifests/values.yaml.tpl), which is the render state measured as CORRECT.
 * The plugin feeds the same subset into the same RHDH theme factory, so the
 * plugin and the app-config route resolve to the same theme.
 *
 * On top of that parity set, the SURFACE fields of the RHDH contract are filled
 * with Vertigo values. The tenant's app-config block leaves them unset, so both
 * it and the first plugin build inherited RHDH's neutral greys — measured in
 * dark mode: cards and the main section painted `#292929`
 * (`cardBackgroundColor` / `mainSectionBackgroundColor`), which read as grey
 * against the `#101820` canvas. The plugin is the single source of the look, so
 * it paints them: `createComponents` reads these exact keys
 * (BackstageContent, MuiCard, MuiPaper, MuiTable*, MuiAppBar, page inset).
 *
 * Deliberately NOT set here (measured consequences):
 *  - `...palettes.light/dark` spread — the RHDH default already spreads it
 *    (lightTheme.esm.js: `{...palettes.light, ...lightThemeOverrides}`), and
 *    re-spreading it on top would overwrite RHDH's own overrides key by key.
 *  - `rhdh.general.pageInset` — `1.5rem` is the RHDH default AND what the
 *    reference state renders (measured: main `margin-right: 24px`). It is a
 *    LAYOUT token, not a brand one; leave it to the shell's own contract.
 *  - `navigation.navItem.hoverBackground` / `navigation.submenu.background` —
 *    `resolveNavigationSidebarColors` derives the sidebar item interaction
 *    colour from `rhdh.general.sidebarItemSelectedBackgroundColor` when both
 *    sources are customised, so an extra hover colour only adds drift.
 */
const light = {
  primary: { main: tokens.brand.blue },
  secondary: { main: tokens.brand.navy },
  background: { default: tokens.brand.canvas, paper: tokens.brand.paper },
  text: { primary: tokens.brand.ink, secondary: tokens.brand.textSecondary },
  navigation: {
    background: tokens.chrome,
    indicator: tokens.brand.dark.primary,
    color: tokens.brand.sidebarText,
    selectedColor: tokens.brand.paper,
    // core-components' Sidebar reads this DIRECTLY for the item hover, and the
    // RHDH default is opaque (#ffffff light / #292929 dark) — which put a white
    // (or grey) block behind the light sidebar label. Setting it keeps the
    // selected colour coming from `rhdh.general` (resolveNavigationSidebarColors
    // prefers the rhdh field when both are customised), so hover ≠ selected.
    navItem: { hoverBackground: tokens.chromeHover },
    submenu: { background: tokens.chromeDeep },
  },
  rhdh: {
    general: {
      // sidebar / chrome. The selected item uses the DEEPER brand blue in light
      // mode: `brand.blue` (#076cfe) is the electric primary and read as harsh
      // against the navy chrome; `brand.link` (#0a5fd9) is the same hue darkened,
      // and keeps white label/icon at 5.75:1 (AA with margin).
      sidebarBackgroundColor: tokens.chrome,
      sidebarItemSelectedBackgroundColor: tokens.brand.link,
      sidebarDividerColor: tokens.hairlineDark,
      // the dark chrome frame: app bar matches the sidebar in BOTH modes, so the
      // header, the sidebar and the brand badge read as one frame. `Scheme: dark`
      // is what picks the light logo variant (useThemedConfig.ts).
      appBarBackgroundScheme: 'dark',
      appBarBackgroundColor: tokens.chrome,
      appBarForegroundColor: tokens.brand.paper,
      appBarBackgroundImage: 'none',
      // page inset band around the content card — brand canvas, not RHDH grey
      pageInsetBackgroundColor: tokens.brand.canvas,
      // surfaces
      mainSectionBackgroundColor: tokens.brand.paper,
      cardBackgroundColor: tokens.brand.paper,
      cardBorderColor: tokens.hairline,
      paperBorderColor: tokens.hairline,
      paperBackgroundImage: 'none',
      popoverBoxShadow: tokens.elevation.e2,
      formControlBackgroundColor: tokens.brand.paper,
      // tables
      tableBackgroundColor: tokens.brand.paper,
      tableBorderColor: tokens.hairline,
      tableRowHover: tokens.state.hoverOverlay,
      tableTitleColor: tokens.brand.ink,
      tableSubtitleColor: tokens.brand.textSecondary,
      tableColumnTitleColor: tokens.brand.ink,
      tabsLinkHoverBackgroundColor: tokens.state.hoverOverlay,
      contrastText: tokens.brand.paper,
    },
  },
};

const dark = {
  primary: { main: tokens.brand.dark.primary },
  secondary: { main: '#9db4ff' },
  background: {
    default: tokens.brand.dark.canvas,
    paper: tokens.brand.dark.paper,
  },
  text: {
    primary: tokens.brand.dark.text,
    secondary: tokens.brand.dark.textSecondary,
  },
  navigation: {
    background: tokens.chrome,
    indicator: tokens.brand.dark.primary,
    color: tokens.brand.sidebarText,
    selectedColor: tokens.brand.paper,
    // core-components' Sidebar reads this DIRECTLY for the item hover, and the
    // RHDH default is opaque (#ffffff light / #292929 dark) — which put a white
    // (or grey) block behind the light sidebar label. Setting it keeps the
    // selected colour coming from `rhdh.general` (resolveNavigationSidebarColors
    // prefers the rhdh field when both are customised), so hover ≠ selected.
    navItem: { hoverBackground: tokens.chromeHover },
    submenu: { background: tokens.chromeDeep },
  },
  rhdh: {
    general: {
      sidebarBackgroundColor: tokens.chrome,
      sidebarItemSelectedBackgroundColor: tokens.brand.dark.primary,
      sidebarDividerColor: tokens.hairlineDark,
      appBarBackgroundScheme: 'dark',
      appBarBackgroundColor: tokens.chrome,
      appBarForegroundColor: tokens.brand.paper,
      appBarBackgroundImage: 'none',
      // canvas, so the band merges with the body instead of RHDH's #151515
      pageInsetBackgroundColor: tokens.brand.dark.canvas,
      mainSectionBackgroundColor: tokens.brand.dark.paper,
      cardBackgroundColor: tokens.brand.dark.paper,
      cardBorderColor: tokens.hairlineDark,
      paperBorderColor: tokens.hairlineDark,
      paperBackgroundImage: 'none',
      popoverBoxShadow: tokens.elevationDark.e2,
      formControlBackgroundColor: tokens.brand.dark.paper,
      tableBackgroundColor: tokens.brand.dark.paper,
      tableBorderColor: tokens.hairlineDark,
      tableRowHover: tokens.state.hoverOverlayDark,
      tableTitleColor: tokens.brand.dark.text,
      tableSubtitleColor: tokens.brand.dark.textSecondary,
      tableColumnTitleColor: tokens.brand.dark.text,
      tabsLinkHoverBackgroundColor: tokens.state.hoverOverlayDark,
      contrastText: tokens.brand.paper,
    },
  },
};

/*
 * Cast: `RHDHThemePalette['general']` types every field as required, but the
 * contract is a PARTIAL override that `mergeUnifiedThemeOptions` deep-merges
 * over the RHDH defaults — exactly how app-config passes it. The cast keeps the
 * partial shape without widening the palette type for callers.
 */
export const vertigoPalette = (mode: ThemeMode): ThemeConfig['palette'] =>
  (mode === 'dark' ? dark : light) as ThemeConfig['palette'];
