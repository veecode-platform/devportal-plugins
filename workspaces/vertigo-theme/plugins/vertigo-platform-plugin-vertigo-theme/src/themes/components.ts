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
 */
export const makeComponents = (mode: ThemeMode): UnifiedThemeOptions['components'] => {
  const dark = mode === 'dark';
  const hairlineColor = dark ? tokens.hairlineDark : tokens.hairline;
  const hairline = `1px solid ${hairlineColor}`;
  const elev = dark ? tokens.elevationDark : tokens.elevation;
  const hoverOverlay = dark ? tokens.state.hoverOverlayDark : tokens.state.hoverOverlay;
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

    // Global header (AppBar) — the veecode global-header renders as an AppBar
    // color="primary", so its bar was painted brand-blue in light mode and dark
    // in dark mode. Pin it to the dark chrome navy in BOTH modes so the top bar
    // matches the sidebar: one coherent dark frame around light/dark content,
    // and blue stays reserved for actions. Flat (no gray AppBar shadow).
    //
    // The header's icons/links/search are painted by the plugin with
    // palette.text.primary (dark ink) and DON'T inherit the AppBar color, so on
    // the dark chrome they vanished. Force the interactive chrome to the same
    // calm light the sidebar uses (idle = sidebarText, hover = white), and the
    // typed search text to white. The search field bg is transparent, so
    // lightening its text + adornment icon is safe.
    MuiAppBar: {
      styleOverrides: {
        colorPrimary: {
          backgroundColor: tokens.chrome,
          // MUI's dark mode paints an elevation overlay (a translucent white
          // gradient) on elevated Paper. The AppBar is elevation4, so in dark
          // mode the header was lightened above the flat chrome sidebar. Kill the
          // overlay so the header stays pure chrome — identical in both themes
          // and matched to the sidebar (which carries no overlay).
          backgroundImage: 'none',
          color: tokens.brand.paper,
          // The header's icons/buttons are colorInherit and pick up the Toolbar's
          // dark ink. We target by TAG (button/a/svg/input), not by MUI class
          // name: createUnifiedTheme prefixes runtime classes with `v5-`, but raw
          // selector strings here are NOT rewritten, so `.MuiIconButton-root`
          // never matches `v5-MuiIconButton-root`. Tag selectors are
          // prefix-agnostic. !important overrides the inherited ink. SVG fill is
          // currentColor, so setting color also recolors the glyphs.
          '& button, & a, & svg': { color: `${tokens.brand.sidebarText} !important` },
          '& button:hover, & a:hover': { color: `${tokens.brand.paper} !important` },
          '& input': { color: `${tokens.brand.paper} !important` },
          '& input::placeholder': { color: tokens.brand.sidebarText, opacity: 0.7 },
        },
        root: { boxShadow: elev.e0 },
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
          '&.Mui-selected': { backgroundColor: hoverOverlay, color: tokens.brand.blue },
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
          '&.Mui-selected': { backgroundColor: hoverOverlay, color: tokens.brand.blue },
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

    // Tabs — the active-route accent: a 2px blue indicator.
    MuiTabs: {
      styleOverrides: {
        indicator: { height: 2, borderRadius: tokens.radius.sm, backgroundColor: tokens.brand.blue },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          letterSpacing: 0,
          minWidth: 0,
          '&:hover': { backgroundColor: hoverOverlay },
          '&.Mui-selected': { color: tokens.brand.blue },
          '&.Mui-disabled': { opacity: tokens.state.disabledOpacity },
          ...focusRing,
        },
      },
    },

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

    // SidebarItem sits on the dark chrome in BOTH themes, so its active accent
    // uses the lighter blue (better contrast on the dark navy-graphite sidebar,
    // and matches the navigation indicator).
    BackstageSidebarItem: {
      styleOverrides: {
        root: {
          textDecorationLine: 'none',
          '&:hover': { backgroundColor: 'rgba(233, 238, 252, 0.06)' },
        },
        selected: {
          color: tokens.brand.dark.primary,
          '& $iconContainer': { color: tokens.brand.dark.primary },
        },
        iconContainer: {},
      },
    },
    // Cast: BackstageInfoCard / BackstageSidebarItem are valid Backstage override
    // keys applied at runtime (verified in the spike), but they are not present in
    // the MUI Components type that UnifiedThemeOptions['components'] resolves to.
  } as UnifiedThemeOptions['components'];
};
