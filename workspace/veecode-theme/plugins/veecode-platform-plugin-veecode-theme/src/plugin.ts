import { createPlugin } from '@backstage/core-plugin-api';

/**
 * Thin plugin shell so the package satisfies the `frontend-plugin` role and the
 * janus/rhdh dynamic-plugin export tooling. The actual payload is the exported
 * theme providers (see {@link VeecodeLightThemeProvider} / {@link VeecodeDarkThemeProvider}),
 * which the app picks up via the `themes:` block in dynamic-plugins.default.yaml.
 */
export const veecodeThemePlugin = createPlugin({
  id: 'veecode-theme',
});
