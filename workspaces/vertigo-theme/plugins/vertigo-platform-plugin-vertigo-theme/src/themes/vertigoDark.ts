import {
  createUnifiedTheme,
  genPageTheme,
  palettes,
  shapes,
} from '@backstage/theme';
import { makeComponents } from './components';
import { typography } from './typography';
import { tokens } from './tokens';

/*
 * Vertigo — Editorial dark (companion to the light-first direction).
 * Uses the REAL Vertigo near-black (#101820) as canvas and brand navy for the
 * sidebar; brand blue lightened for contrast on dark. WCAG AA validated.
 */
const navy = tokens.brand.navy; // brand navy — sidebar, header
const navyDeep = tokens.brand.navyDeep;
const canvas = tokens.brand.dark.canvas; // brand near-black — app background
const surface = tokens.brand.dark.paper; // near-black lifted, navy-tinted paper
const blue = tokens.brand.dark.primary; // brand blue lightened — primary on dark (5.96:1)
const blueSoft = '#6796f5'; // for link hover on dark (6.18:1)
const ink = tokens.brand.dark.text; // off-white tinted navy — body text (15.9:1)
const subtle = tokens.brand.dark.textSecondary; // secondary text on dark (8.05:1 — AAA)

const header = genPageTheme({ colors: [navy, navyDeep], shape: shapes.wave });

export const vertigoDark = createUnifiedTheme({
  palette: {
    ...palettes.dark,
    primary: { main: blue },
    secondary: { main: '#9db4ff' },
    background: { default: canvas, paper: surface },
    text: {
      primary: ink,
      secondary: subtle,
    },
    link: blue,
    linkHover: blueSoft,
    navigation: {
      ...palettes.dark.navigation,
      background: tokens.chrome,
      indicator: blue,
      color: tokens.brand.sidebarText,
      selectedColor: '#ffffff',
      navItem: { hoverBackground: 'rgba(233, 238, 252, 0.06)' },
      submenu: { background: tokens.chromeDeep },
    },
  },
  defaultPageTheme: 'home',
  pageTheme: {
    home: header,
    documentation: header,
    tool: header,
    service: header,
    website: header,
    library: header,
    other: header,
    app: header,
    apis: header,
  },
  fontFamily: '"Geist Sans", system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
  typography,
  components: makeComponents('dark'),
});
