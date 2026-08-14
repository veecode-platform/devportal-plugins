import { useMemo, type ReactNode } from 'react';
import { createUnifiedTheme, UnifiedThemeProvider } from '@backstage/theme';
import {
  useThemeOptions,
  type ThemeConfig,
} from '@red-hat-developer-hub/backstage-plugin-theme';
import {
  StyledEngineProvider,
  ThemeProvider as MuiThemeProvider,
  type Theme as MuiTheme,
} from '@mui/material/styles';
import { vertigoLightThemeConfig } from './themes/vertigoLight';
import { vertigoDarkThemeConfig } from './themes/vertigoDark';
import { makeComponents } from './themes/components';
import { mergeComponents } from './themes/mergeComponents';
import type { ThemeMode } from './themes/tokens';

/*
 * Builds the theme the way the RHDH app-config route builds it, then merges the
 * Vertigo component layer on top.
 *
 * `useThemeOptions` is the same factory `variant: rhdh` runs in the shell
 * (hooks/useThemeOptions.esm.js): default RHDH config for the mode → deep-merge
 * of our ThemeConfig → `createComponents(merged)`. It is a hook but a trivial
 * one: `useMemo` only, no `useApi`/context (unlike `useThemeConfig`, which reads
 * app.branding.theme and is what we deliberately do NOT use — the plugin is the
 * single source of the Vertigo look).
 */
const useVertigoTheme = (config: ThemeConfig, mode: ThemeMode) => {
  const options = useThemeOptions(config);
  return useMemo(
    () =>
      createUnifiedTheme({
        ...options,
        components: mergeComponents(options.components, makeComponents(mode)),
      }),
    [options, mode],
  );
};

/*
 * Provider envelope copied from the RHDH theme package's own ThemeProvider
 * (components/ThemeProvider.esm.js): UnifiedThemeProvider for the v4/v5 bridge,
 * then StyledEngineProvider `injectFirst` + the v5 MUI ThemeProvider. The
 * `injectFirst` part is load-bearing — it puts MUI's generated styles before the
 * app stylesheet so component overrides keep the same precedence they have in
 * the app-config route. The previous build wrapped only UnifiedThemeProvider.
 */
const VertigoThemeProvider = ({
  config,
  mode,
  children,
}: {
  config: ThemeConfig;
  mode: ThemeMode;
  children?: ReactNode;
}) => {
  const theme = useVertigoTheme(config, mode);
  // Cast: `getTheme('v5')` is typed as the v4|v5 union (`SupportedThemes`) and
  // the two MUI mixin types are structurally incompatible
  // (`mixins.toolbar.alignmentBaseline`). The RHDH theme package does the same
  // wiring from JS, where the union never surfaces.
  const v5Theme = theme.getTheme('v5') as MuiTheme;
  return (
    <UnifiedThemeProvider theme={theme}>
      <StyledEngineProvider injectFirst>
        <MuiThemeProvider theme={v5Theme}>{children}</MuiThemeProvider>
      </StyledEngineProvider>
    </UnifiedThemeProvider>
  );
};

/**
 * Vertigo light theme provider.
 *
 * Wired into the app through the dynamic-plugin `themes:` config
 * (`importName: VertigoLightThemeProvider`, `id: light`) — which makes the
 * DynamicRoot shell drop the like-`id` static theme and use this one instead.
 */
export const VertigoLightThemeProvider = ({
  children,
}: {
  children?: ReactNode;
}) => (
  <VertigoThemeProvider config={vertigoLightThemeConfig} mode="light">
    {children}
  </VertigoThemeProvider>
);

/** Vertigo dark theme provider (see {@link VertigoLightThemeProvider}; `id: dark`). */
export const VertigoDarkThemeProvider = ({
  children,
}: {
  children?: ReactNode;
}) => (
  <VertigoThemeProvider config={vertigoDarkThemeConfig} mode="dark">
    {children}
  </VertigoThemeProvider>
);
