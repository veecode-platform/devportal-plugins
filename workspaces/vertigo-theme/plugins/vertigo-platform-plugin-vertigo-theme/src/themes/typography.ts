/*
 * Vertigo typography — Geist Sans self-hosted (brand font Product Sans is
 * proprietary / no public license, so Geist stands in as a tasteful, modern,
 * self-hostable substitute).
 *
 * ONLY the font families are set. The RHDH theme default carries the type scale
 * (`fontSize`/`fontWeight`/`marginBottom` per heading, htmlFontSize 16) and
 * `mergeUnifiedThemeOptions` deep-merges this over it, so the headings keep the
 * reference state's metrics and only change family. Overriding the scale here
 * would move every heading relative to the app-config render.
 */
import type { ThemeConfig } from '@red-hat-developer-hub/backstage-plugin-theme';

export const fontFamily =
  '"Geist Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

const family = { fontFamily };

/*
 * Cast: `BackstageTypography` types every heading as complete
 * (fontSize/fontWeight/marginBottom). This is a PARTIAL override that the RHDH
 * factory deep-merges over its own scale — the same contract app-config uses.
 */
export const typography = {
  fontFamily,
  h1: family,
  h2: family,
  h3: family,
  h4: family,
  h5: family,
  h6: family,
} as ThemeConfig['typography'];
