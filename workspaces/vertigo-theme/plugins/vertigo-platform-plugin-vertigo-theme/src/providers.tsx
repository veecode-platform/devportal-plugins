import { ReactNode } from 'react';
import { UnifiedThemeProvider } from '@backstage/theme';
import { vertigoLight } from './themes/vertigoLight';
import { vertigoDark } from './themes/vertigoDark';

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
}) => <UnifiedThemeProvider theme={vertigoLight}>{children}</UnifiedThemeProvider>;

/** Vertigo dark theme provider (see {@link VertigoLightThemeProvider}; `id: dark`). */
export const VertigoDarkThemeProvider = ({
  children,
}: {
  children?: ReactNode;
}) => <UnifiedThemeProvider theme={vertigoDark}>{children}</UnifiedThemeProvider>;
