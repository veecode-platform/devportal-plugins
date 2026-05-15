import type { UnifiedThemeOptions } from '@backstage/theme';

/**
 * MUI v5 component overrides shared by the VeeCode light & dark themes.
 *
 * This is where most of the "doesn't look like stock Backstage" lives. Keep it
 * tasteful and version-resilient — prefer `styleOverrides.root` tweaks over
 * deep class-key selectors, which break across MUI minors.
 */
export const components: UnifiedThemeOptions['components'] = {
  MuiButton: {
    styleOverrides: {
      root: { textTransform: 'none', borderRadius: 8 },
    },
  },
  MuiTab: {
    styleOverrides: {
      root: { textTransform: 'none' },
    },
  },
  MuiCard: {
    styleOverrides: {
      root: { borderRadius: 12 },
    },
  },
  MuiChip: {
    styleOverrides: {
      root: { borderRadius: 6 },
    },
  },
};
