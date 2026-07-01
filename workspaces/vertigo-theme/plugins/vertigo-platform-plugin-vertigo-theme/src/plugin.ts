import { createPlugin } from '@backstage/core-plugin-api';

/**
 * Thin plugin shell so the package satisfies the `frontend-plugin` role and the
 * janus/rhdh dynamic-plugin export tooling. The actual payload is the exported
 * theme providers (see {@link VertigoLightThemeProvider} / {@link VertigoDarkThemeProvider}),
 * which the app picks up via the `themes:` block in the dynamic-plugins config.
 */
export const vertigoThemePlugin = createPlugin({
  id: 'vertigo-theme',
});
