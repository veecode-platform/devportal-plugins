import { defaultTypography } from '@backstage/theme';

/*
 * Vertigo typography — Geist Sans self-hosted (brand font Product Sans is
 * proprietary / no public license, so Geist stands in as a tasteful, modern,
 * self-hostable substitute). Editorial hierarchy: strong weights, a real
 * modular scale for h1–h6. letterSpacing/lineHeight tuning lives in
 * components.ts (MuiTypography) since BackstageTypography only carries
 * fontSize/fontWeight/marginBottom per heading.
 *
 * Spreads defaultTypography so the required BackstageTypography shape stays
 * complete (htmlFontSize, marginBottom, etc.); we only override family/scale.
 */
const geist =
  '"Geist Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export const typography = {
  ...defaultTypography,
  fontFamily: geist,
  h1: { ...defaultTypography.h1, fontFamily: geist, fontSize: '2.5rem', fontWeight: 700 },
  h2: { ...defaultTypography.h2, fontFamily: geist, fontSize: '2rem', fontWeight: 700 },
  h3: { ...defaultTypography.h3, fontFamily: geist, fontSize: '1.5rem', fontWeight: 600 },
  h4: { ...defaultTypography.h4, fontFamily: geist, fontSize: '1.25rem', fontWeight: 600 },
  h5: { ...defaultTypography.h5, fontFamily: geist, fontSize: '1.125rem', fontWeight: 600 },
  h6: { ...defaultTypography.h6, fontFamily: geist, fontSize: '1rem', fontWeight: 600 },
};
