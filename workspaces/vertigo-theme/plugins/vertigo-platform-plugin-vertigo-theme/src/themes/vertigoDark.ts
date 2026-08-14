import type { ThemeConfig } from '@red-hat-developer-hub/backstage-plugin-theme';
import { vertigoPalette } from './palette';
import { fontFamily, typography } from './typography';
import { tokens } from './tokens';

/**
 * Vertigo — dark theme CONFIG (companion to {@link vertigoLightThemeConfig};
 * see that file for why this is a `ThemeConfig` fed to the RHDH theme factory
 * instead of a hand-built `createUnifiedTheme` object).
 */
export const vertigoDarkThemeConfig: ThemeConfig = {
  variant: 'rhdh',
  mode: 'dark',
  palette: vertigoPalette('dark'),
  fontFamily,
  typography,
  // see vertigoLight.ts — branded navy wave band instead of the RHDH grey one
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
