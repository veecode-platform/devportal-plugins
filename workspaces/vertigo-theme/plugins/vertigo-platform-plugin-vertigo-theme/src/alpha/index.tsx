import { createFrontendModule } from '@backstage/frontend-plugin-api';
import { ThemeBlueprint } from '@backstage/plugin-app-react';

import {
  VertigoDarkThemeProvider,
  VertigoLightThemeProvider,
} from '../providers';

/*
 * New Frontend System exposure of the existing Vertigo theme providers.
 *
 * ADR-011 (devportal-platform) is partially superseded here: the OFS wiring
 * premise — a dynamic-plugin `themes:` config entry consumed by the
 * DynamicRoot shell (see providers.tsx) — falls away on the NFS path. It is
 * replaced by a native `ThemeBlueprint` extension. The palette, typography
 * and component overrides (vertigoLight/vertigoDark, unchanged) are the same
 * brand decision as before; only the registration mechanism changes.
 *
 * `id: 'light'` / `id: 'dark'` are deliberate — not `vertigo-light` /
 * `vertigo-dark`. This mirrors the identifiers the OFS providers already
 * used (see providers.tsx: "id: light" / "id: dark") so the picker replaces
 * the default themes by id instead of adding two more entries alongside
 * them. This diverges intentionally from the veecode-theme NFS alpha module,
 * which used brand-prefixed ids (`veecode-light` / `veecode-dark`) to add
 * rather than replace.
 */
const vertigoLightTheme = ThemeBlueprint.make({
  name: 'light',
  params: {
    theme: {
      id: 'light',
      title: 'Vertigo Light',
      variant: 'light',
      Provider: VertigoLightThemeProvider,
    },
  },
});

const vertigoDarkTheme = ThemeBlueprint.make({
  name: 'dark',
  params: {
    theme: {
      id: 'dark',
      title: 'Vertigo Dark',
      variant: 'dark',
      Provider: VertigoDarkThemeProvider,
    },
  },
});

export default createFrontendModule({
  pluginId: 'app',
  extensions: [vertigoLightTheme, vertigoDarkTheme],
});

// Plain re-export, not a registered extension: the OFS badge was mounted by
// host config at the `global.header/component` RHDH mount point (see
// README.md), a mechanism that has no verified NFS blueprint equivalent as
// of this change. Keeping it available from the alpha surface preserves the
// same "host wires it in" division of responsibility the OFS side used.
export { VertigoHeaderBadge } from '../components/VertigoHeaderBadge';
