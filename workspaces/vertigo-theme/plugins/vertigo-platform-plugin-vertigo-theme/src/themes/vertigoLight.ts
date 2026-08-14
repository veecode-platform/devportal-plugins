import type { ThemeConfig } from '@red-hat-developer-hub/backstage-plugin-theme';
import { vertigoPalette } from './palette';
import { fontFamily, typography } from './typography';
import { tokens } from './tokens';

/*
 * Vertigo — light theme CONFIG (not a built theme).
 *
 * Why a config and not a `createUnifiedTheme(...)` object: the 3.x shell's
 * layout is carried by the RHDH theme's COMPONENT layer, not by
 * `palette.rhdh.general.*` alone. `variant: 'rhdh'` runs the same factory the
 * app-config route runs (`useThemeOptions` → `createComponents`), which is what
 * emits, among others:
 *   - `BackstageSidebarPage.root`: `& nav ~ main { marginLeft: 0 !important }`,
 *     `margin: pageInset`, `clipPath: rect(... round 1rem)` and the inset
 *     background — the sidebar↔content seam and the PF6 page inset;
 *   - `BackstageSidebar.drawer`: `borderRight: 0.5rem solid <sidebar bg>` —
 *     the reason the painted sidebar reaches x=238 in the reference state
 *     instead of stopping at the drawer's own 224px;
 *   - the selected sidebar item colours via `resolveNavigationSidebarColors`
 *     (background = `rhdh.general.sidebarItemSelectedBackgroundColor`,
 *     foreground/icon = `navigation.selectedColor`).
 * A bare `@backstage/theme` `createUnifiedTheme` emits NONE of that, which is
 * the regression the bs_1.54.0-next.0 tag shipped: the shell's own
 * `marginLeft: 27px` on `BackstageSidebarPage-root` (Root.tsx:150, present in
 * both states) stayed uncompensated and unpainted.
 *
 * Vertigo's own layer is applied on top in `providers.tsx` (palette above,
 * Geist typography, and the component polish in `components.ts`).
 */
export const vertigoLightThemeConfig: ThemeConfig = {
  variant: 'rhdh',
  mode: 'light',
  palette: vertigoPalette('light'),
  fontFamily,
  typography,
  /*
   * Page header band — the branded navy band with the wave, which is the look
   * VeeCode 2.x had and the RHDH default drops (it paints a flat
   * `linear-gradient(#ffffff)` light / `linear-gradient(#292929)` dark — the grey
   * band that showed up as "the header is not blue").
   *
   * ONE `default` entry, not the 9 per-kind entries the first build had: RHDH's
   * own config has a single page theme and the shell's `defaultPageTheme` points
   * at it, so one entry covers every page. `shape: 'wave'` is resolved by
   * `createPageTheme` through `shapes[...]` of @backstage/theme, so the SVG comes
   * from the library instead of being frozen into the plugin.
   */
  defaultPageTheme: 'default',
  pageTheme: {
    default: {
      backgroundColor: [tokens.brand.navy, tokens.brand.navyDeep],
      shape: 'wave',
      fontColor: tokens.brand.paper,
    },
  },
  options: {},
};
