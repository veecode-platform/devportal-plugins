import type { UnifiedThemeOptions } from '@backstage/theme';
import { tokens, type ThemeMode } from './tokens';

/*
 * Vertigo — MUI + Backstage component overrides. ONE coherent visual language:
 * "corporate-solid SaaS" (ref. Stripe dashboard, a well-made RHDH).
 *
 * `makeComponents(mode)` is a FACTORY so the light and dark themes share one
 * language but pick theme-aware scale values: a navy-tinted hairline/shadow
 * reads on the light canvas but VANISHES on dark paper, so on dark we swap to a
 * light cool hairline + a black-based shadow. Every scale value comes from
 * `tokens` — zero scale literals here.
 *
 * Language decisions (fixed by the design brief, executed under /frontend-design):
 *  - Surfaces sit on a soft-but-DEFINED shadow + a 1px hairline — never MUI's
 *    heavy gray elevation, never flat, and never invisible on dark.
 *  - Radius mapped by ROLE: chip = sm, controls (button/input/menu) = md,
 *    surfaces (card/dialog/elevated paper) = lg.
 *  - Brand blue is a scarce accent: primary button, link, active tab/route
 *    indicator, focus ring, active icon. Nothing else.
 *  - Body chrome stays neutral. No colored band on card headers.
 *
 * States pattern — applied consistently to EVERY interactive surface:
 *  hover → tinted overlay · focus → 2px blue ring on :focus-visible ·
 *  selected → brand blue · disabled → reduced opacity.
 *
 * SCOPE BOUNDARY (2026-08-14 regression fix). This layer is now merged ON TOP of
 * the RHDH component layer (`variant: 'rhdh'` → `createComponents`), which owns
 * the SHELL CHROME: sidebar drawer, sidebar items, page inset / sidebar↔content
 * seam, app bar, tabs and the page header. Anything this file used to override
 * in that set diverged from the app-config reference state, so the following
 * were REMOVED rather than re-tuned:
 *  - `MuiAppBar.colorPrimary` — repainted the global header brand-navy; the
 *    reference header is the RHDH inset colour (measured `#f2f2f2` / `#151515`).
 *  - `MuiTabs.indicator` + `MuiTab['&.Mui-selected']` — the reference selected
 *    tab is `text.primary` (measured `rgb(238,241,251)` on dark), not brand blue.
 *  - `BackstageSidebarItem` root/selected/iconContainer — the RHDH layer paints
 *    the selected item from `rhdh.general.sidebarItemSelectedBackgroundColor`
 *    (background) + `navigation.selectedColor` (label AND icon). The old
 *    `selected.color` pinned the icon to a blue nearly identical to the selected
 *    background, i.e. the invisible dark-mode icon. Its `'& $iconContainer'`
 *    rule was JSS reference syntax and inert under the v5/Emotion layer anyway.
 * What stays is the surface polish the reference state does not measure: radius,
 * hairline, elevation, density and control shapes.
 */
export const makeComponents = (mode: ThemeMode): UnifiedThemeOptions['components'] => {
  const dark = mode === 'dark';
  const hairlineColor = dark ? tokens.hairlineDark : tokens.hairline;
  const hairline = `1px solid ${hairlineColor}`;
  const elev = dark ? tokens.elevationDark : tokens.elevation;
  const hoverOverlay = dark ? tokens.state.hoverOverlayDark : tokens.state.hoverOverlay;
  // Mode-aware accent. `tokens.brand.blue` (#076cfe) is the LIGHT primary; using
  // it on dark produced a blue-on-blue "selected" state indistinguishable from
  // the selected background (the dark-mode invisible-icon class of bug).
  const accent = dark ? tokens.brand.dark.primary : tokens.brand.blue;
  // Keyboard-only focus ring, identical on every interactive component.
  const focusRing = {
    '&:focus-visible': {
      outline: `2px solid ${tokens.state.focusRing}`,
      outlineOffset: 2,
    },
  } as const;

  return {
    MuiCssBaseline: {
      styleOverrides: {
        body: { WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale' },
      },
    },

    /*
     * Global header FOREGROUND only. The bar's own colour comes from the palette
     * (`rhdh.general.appBarBackgroundColor` → chrome navy, applied by the RHDH
     * layer), so nothing here paints a background — that was the old override's
     * mistake.
     *
     * The foreground has to live here because `rhdh.general.appBarForegroundColor`
     * is NOT consumed by `createComponents` (verified: only appBarBackgroundColor
     * and appBarBackgroundImage are). The veecode global-header paints its icons,
     * links and search input with `palette.text.primary` — dark ink — so on the
     * navy bar they vanish (measured: invisible header icons in light mode).
     *
     * Targeted by TAG (button/a/svg/input), not by MUI class name:
     * createUnifiedTheme prefixes runtime classes with `v5-`, and raw selector
     * strings here are NOT rewritten, so `.MuiIconButton-root` would never match.
     * SVG fill is currentColor, so `color` recolours the glyphs too.
     */
    MuiAppBar: {
      styleOverrides: {
        colorPrimary: {
          '& button, & a, & svg': { color: `${tokens.brand.sidebarText} !important` },
          '& button:hover, & a:hover': { color: `${tokens.brand.paper} !important` },
          '& input': { color: `${tokens.brand.paper} !important` },
          '& input::placeholder': { color: tokens.brand.sidebarText, opacity: 0.7 },
        },
      },
    },

    // Editorial headings: negative tracking + tightened leading (scale/weight
    // live in typography.ts; only what BackstageTypography can't carry lives here).
    MuiTypography: {
      styleOverrides: {
        h1: { letterSpacing: '-0.021em', lineHeight: 1.1 },
        h2: { letterSpacing: '-0.019em', lineHeight: 1.15 },
        h3: { letterSpacing: '-0.017em', lineHeight: 1.2 },
        h4: { letterSpacing: '-0.014em', lineHeight: 1.25 },
        h5: { letterSpacing: '-0.011em' },
        h6: { letterSpacing: '-0.008em' },
      },
    },

    // Button — solid SaaS control: no uppercase, real weight, flat (only surfaces
    // cast shadow), md radius, medium density height. Blue = primary variant only.
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: tokens.radius.md,
          minHeight: tokens.density.buttonHeight,
          paddingInline: 14,
          boxShadow: elev.e0,
          transition: 'background-color 120ms ease, border-color 120ms ease',
          '&:hover': { boxShadow: elev.e0 },
          '&.Mui-disabled': { opacity: tokens.state.disabledOpacity },
          ...focusRing,
        },
        containedPrimary: { '&:hover': { boxShadow: elev.e0 } },
        text: { '&:hover': { backgroundColor: hoverOverlay } },
        outlined: {
          borderColor: hairlineColor,
          '&:hover': { borderColor: hairlineColor, backgroundColor: hoverOverlay },
        },
      },
    },

    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: tokens.radius.md,
          '&:hover': { backgroundColor: hoverOverlay },
          '&.Mui-disabled': { opacity: tokens.state.disabledOpacity },
          ...focusRing,
        },
      },
    },

    MuiChip: {
      styleOverrides: {
        root: { borderRadius: tokens.radius.sm, fontWeight: 500 },
        outlined: { borderColor: hairlineColor },
      },
    },

    // Text inputs — md radius, hairline outline at rest, brand-blue outline on
    // focus (this IS the accent), medium input height.
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: tokens.radius.md,
          minHeight: tokens.density.inputHeight,
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: hairlineColor },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: tokens.state.focusRing,
            borderWidth: 2,
          },
          '&.Mui-disabled': { opacity: tokens.state.disabledOpacity },
        },
        notchedOutline: { borderColor: hairlineColor },
      },
    },

    MuiSelect: {
      styleOverrides: {
        select: { minHeight: tokens.density.inputHeight, display: 'flex', alignItems: 'center' },
      },
    },

    // Paper is the base surface. `rounded` sets the surface radius; elevation1 is
    // remapped from MUI's gray stack to the theme-aware e1 shadow.
    MuiPaper: {
      styleOverrides: {
        rounded: { borderRadius: tokens.radius.lg },
        elevation1: { boxShadow: elev.e1 },
      },
    },

    // Card — a first-class surface: lg radius, hairline edge, e1 shadow. The
    // hairline + soft shadow together read as "solid SaaS", and now stay visible
    // on dark surfaces (theme-aware hairline/shadow).
    MuiCard: {
      styleOverrides: {
        // NOTE: only FLAT props here reach the v4 layer. createUnifiedTheme's v4
        // translation drops nested selector objects, so the UserListPicker
        // first-child-label spacing lives in styles/component-fixes.css (global
        // CSS), not a `& > ...` rule here — see that file for the why.
        root: { borderRadius: tokens.radius.lg, border: hairline, boxShadow: elev.e1 },
      },
    },

    MuiDialog: {
      styleOverrides: {
        paper: { borderRadius: tokens.radius.lg, boxShadow: elev.e2 },
      },
    },

    MuiMenu: {
      styleOverrides: {
        paper: { borderRadius: tokens.radius.md, boxShadow: elev.e2, border: hairline },
      },
    },
    MuiPopover: {
      styleOverrides: {
        paper: { borderRadius: tokens.radius.md, boxShadow: elev.e2 },
      },
    },

    MuiMenuItem: {
      styleOverrides: {
        root: {
          '&:hover': { backgroundColor: hoverOverlay },
          '&.Mui-selected': { backgroundColor: hoverOverlay, color: accent },
          '&.Mui-selected:hover': { backgroundColor: hoverOverlay },
          ...focusRing,
        },
      },
    },

    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: tokens.radius.md,
          '&:hover': { backgroundColor: hoverOverlay },
          '&.Mui-selected': { backgroundColor: hoverOverlay, color: accent },
          '&.Mui-selected:hover': { backgroundColor: hoverOverlay },
          ...focusRing,
        },
      },
    },

    // Tooltip — transient chrome carries the dark navy chrome cue.
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: tokens.brand.navy,
          color: tokens.brand.paper,
          borderRadius: tokens.radius.sm,
          fontWeight: 500,
          boxShadow: elev.e1,
        },
        arrow: { color: tokens.brand.navy },
      },
    },

    // Tabs are owned by the RHDH layer (indicator, selected colour, density) —
    // see the SCOPE BOUNDARY note in the file header.

    // Table — quiet, dense, editorial: hairline rules only, bolder head, cells on
    // the medium row-height for an even rhythm.
    MuiTableCell: {
      styleOverrides: {
        root: { borderBottom: hairline, height: tokens.density.rowHeight },
        head: { fontWeight: 600, borderBottom: hairline, color: tokens.brand.textSecondary },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&:hover': { backgroundColor: hoverOverlay },
          '&.Mui-selected': { backgroundColor: hoverOverlay },
          '&.Mui-selected:hover': { backgroundColor: hoverOverlay },
        },
      },
    },

    MuiLink: {
      styleOverrides: {
        root: {
          textDecorationLine: 'none',
          '&:hover': { textDecorationLine: 'underline' },
          ...focusRing,
        },
      },
    },

    MuiDivider: {
      styleOverrides: { root: { borderColor: hairlineColor } },
    },

    // ---- Backstage-specific overrides ----
    // Only keys empirically build-safe in this workspace (@backstage/core-components
    // is not installed, so no Backstage key is typed). InfoCard + SidebarItem are
    // the two v1 shipped and built with.
    BackstageInfoCard: {
      styleOverrides: {
        root: { borderRadius: tokens.radius.lg, border: hairline, boxShadow: elev.e1 },
        header: { borderBottom: hairline },
      },
    },

    /*
     * ---- Layout adjustments ON TOP of the RHDH layer -----------------------
     *
     * Deliberate departures from the reference render (all measured before and
     * after), not bug fixes:
     *
     * 1. The content sits FLUSH against the sidebar. The shell hardcodes
     *    `marginLeft: 27px` on the BackstageSidebarPage root
     *    (Root.tsx:150, present in every theme) and RHDH only cancels it on
     *    `main`, leaving a 27px band that the reference state fills with the page
     *    inset colour. `RHDHPageWithoutFixHeight/sidebarLayout` is a themeable
     *    slot (the shell declares `styled(Box, {name, slot})`), so the margin is
     *    zeroed through the theme instead of a global `!important` rule.
     * 2. With the margin gone, the drawer's 0.5rem right border (which RHDH adds
     *    to stretch the painted sidebar across that band) would overlap the
     *    content card, so it goes away.
     *
     * REVERTED (round 2, Gio's call): the page inset and the rounded corners are
     * BACK. A third departure used to drop RHDH's `margin: pageInset` and its
     * rounded `clipPath` on `main` (plus `maxHeight: 100vh` to compensate), which
     * made the content flush on all four sides and square everywhere. That
     * override is gone, so `main` inherits the RHDH treatment again.
     *
     * 3. …but RHDH only insets `main` on the RIGHT and BOTTOM: measured
     *    `margin: 0 24px 24px 0`, i.e. flush against the app bar and the sidebar.
     *    Gio asked for a UNIFORM inset, and the two missing sides CANNOT be set
     *    from here — RHDH ships
     *      `#rhdh-above-…-header-container:has(*) ~ … main { margin-top: 0 !important }`
     *    whose specificity (two ids + a class) outranks any themeable slot. So the
     *    top and left insets live in `styles/component-fixes.css`, which exists for
     *    exactly this class of problem.
     */
    RHDHPageWithoutFixHeight: {
      styleOverrides: {
        sidebarLayout: {
          '@media (min-width: 600px)': {
            '& > div': { marginLeft: 0 },
          },
        },
      },
    },
    BackstageSidebar: {
      styleOverrides: {
        drawer: { borderRight: 'none' },
      },
    },

    /*
     * Sidebar selected item — breathing room on the RIGHT.
     *
     * The RHDH layer paints the item root with `margin-left: 0.5rem !important`
     * and `width: calc(100% - 0.5rem) !important`, so the painted block ends
     * FLUSH against the drawer's right edge: measured item right = 230px inside a
     * 230px container, against an 8px gap on the left. Subtracting the inset twice
     * makes it symmetric — 8px of chrome on each side — without touching the
     * margin, so the selection indicator and the label stay aligned.
     *
     * Two mechanics are load-bearing here:
     *  - `&&` doubles the class in the emitted selector (0,2,0) and the value
     *    carries `!important`, because the RHDH root rule is (0,1,0) `!important`.
     *    Specificity alone loses to an important declaration; important alone ties
     *    on specificity and would be decided by injection order. Both together win
     *    deterministically.
     *  - the COLLAPSED item must keep its square 72px. RHDH sets that through
     *    `.selected.closed` (0,2,0, no important), which our (0,2,0) important rule
     *    would otherwise beat, stretching the icon-only rail. So `closed` is
     *    restated at (0,3,0) to stay on top. The 72px mirrors the RHDH value — if
     *    the rail width ever changes upstream, this is the line to follow.
     *
     * Scope note: everything ELSE about this item is owned by the RHDH layer
     * (selected background from `rhdh.general.sidebarItemSelectedBackgroundColor`,
     * label + icon from `navigation.selectedColor`) — see the header note.
     */
    BackstageSidebarItem: {
      styleOverrides: {
        selected: {
          '&&': {
            width: `calc(100% - ${tokens.density.sidebarItemInset * 2}px) !important`,
          },
        },
        closed: {
          '&&&': { width: `${tokens.density.sidebarRailWidth}px !important` },
        },
      },
    },

    //
    // Cast: BackstageInfoCard is a valid Backstage override key applied at
    // runtime (verified in the spike), but it is not present in the MUI
    // Components type that UnifiedThemeOptions['components'] resolves to.
  } as UnifiedThemeOptions['components'];
};
