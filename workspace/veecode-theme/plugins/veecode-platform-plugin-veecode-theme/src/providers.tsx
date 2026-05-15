import { ReactNode } from 'react';
import { UnifiedThemeProvider } from '@backstage/theme';
import { veecodeLight } from './themes/veecodeLight';
import { veecodeDark } from './themes/veecodeDark';

/**
 * VeeCode light theme provider.
 *
 * Wired into the app through the dynamic-plugin `themes:` config in
 * dynamic-plugins.default.yaml (`importName: VeecodeLightThemeProvider`,
 * `id: light`) — which makes the DynamicRoot shell drop the like-`id` static
 * theme and use this one instead.
 */
export const VeecodeLightThemeProvider = ({
  children,
}: {
  children?: ReactNode;
}) => <UnifiedThemeProvider theme={veecodeLight}>{children}</UnifiedThemeProvider>;

/** VeeCode dark theme provider (see {@link VeecodeLightThemeProvider}; `id: dark`). */
export const VeecodeDarkThemeProvider = ({
  children,
}: {
  children?: ReactNode;
}) => <UnifiedThemeProvider theme={veecodeDark}>{children}</UnifiedThemeProvider>;
