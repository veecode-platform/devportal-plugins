// Geist Sans (self-hosted via @fontsource) — the theme's fontFamily points at
// "Geist Sans"; these imports bundle the woff2 so it actually loads inside the
// Module-Federation bundle (rhdh-cli plugin export → webpack handles the CSS +
// font files).
// NOTE: these CSS imports break `backstage-cli package build` (Rollup) — but
// that step is not on the dynamic-plugin path (export-dynamic depends only on
// `tsc`), so it's a non-issue for the runtime artifact.
//
// bui-tokens.css was removed from the bundle: the audit proved the DevPortal UI
// renders in MUI today (zero `[class*="bui-"]` elements on screen), so BUI token
// overrides paint nothing. Parked at _scratch/future-proofing/bui-tokens.css for
// when/if the portal migrates components to @backstage/ui.
import '@fontsource/geist-sans/400.css';
import '@fontsource/geist-sans/500.css';
import '@fontsource/geist-sans/600.css';
import '@fontsource/geist-sans/700.css';

// Global CSS for v4-layer fixes the theme's component overrides can't reach
// (createUnifiedTheme drops nested selectors for the v4 translation). See the
// file header for the full rationale.
import './styles/component-fixes.css';

export { vertigoThemePlugin } from './plugin';
export {
  VertigoLightThemeProvider,
  VertigoDarkThemeProvider,
} from './providers';
export { vertigoLight } from './themes/vertigoLight';
export { vertigoDark } from './themes/vertigoDark';
export { VertigoHeaderBadge } from './components/VertigoHeaderBadge';

// NOTE: custom Lucide system-icons were reverted. Only ~2/10 sidebar icons pass
// through the app icon registry (home, group); the rest are shell-baked, so a
// partial swap left the icon set visually mixed/inconsistent. Documented as a
// partial limitation — the whole set only becomes swappable via image fork.
// See _scratch/VERIFICACAO-RUNTIME.md.
