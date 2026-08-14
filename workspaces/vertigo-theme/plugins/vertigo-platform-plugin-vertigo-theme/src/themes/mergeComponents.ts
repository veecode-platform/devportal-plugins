import type { UnifiedThemeOptions } from '@backstage/theme';

type Components = UnifiedThemeOptions['components'];
type Plain = Record<string, unknown>;

const isPlainObject = (value: unknown): value is Plain =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/*
 * Deep merge with `custom` winning on conflicts. Needed because the RHDH layer
 * and the Vertigo layer both write `styleOverrides` on the same component keys
 * (e.g. MuiButton): a shallow spread would drop the RHDH slots for every key
 * Vertigo touches — for MuiPaper/MuiCard that means losing RHDH's PF6 surface
 * treatment, not just adding a radius.
 *
 * Mirrors the semantics of the theme package's own `deepMergeObjects`, which is
 * not part of its public export surface.
 */
const deepMerge = (base: unknown, custom: unknown): unknown => {
  if (!isPlainObject(base) || !isPlainObject(custom)) {
    return custom !== undefined ? custom : base;
  }
  const out: Plain = { ...base };
  for (const key of Object.keys(custom)) {
    out[key] = key in base ? deepMerge(base[key], custom[key]) : custom[key];
  }
  return out;
};

/** Merges the Vertigo component layer over the RHDH one (Vertigo wins). */
export const mergeComponents = (
  rhdh: Components,
  vertigo: Components,
): Components => deepMerge(rhdh ?? {}, vertigo ?? {}) as Components;
