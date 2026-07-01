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
 * Vertigo — Editorial light (Linear/Vercel-like).
 * Palette derived from the REAL Vertigo brand colors (vertigo.com.br), not
 * invented blues. All fg/bg pairs validated for WCAG AA in _scratch/wcag-check.mjs.
 */
const navy = tokens.brand.navy; // brand dominant navy — sidebar, header, secondary
const navyDeep = tokens.brand.navyDeep; // navy darkened, for a subtle header depth stop
const blue = tokens.brand.blue; // brand blue — primary / buttons (4.58:1 on white)
const blueLink = tokens.brand.link; // blue darkened for link text (5.75:1 — AA w/ margin)
const blueSoft = '#4d94ff'; // blue lightened — sidebar indicator on navy (5.55:1)
const ink = tokens.brand.ink; // brand near-black — body text (16.4:1 on canvas)
const canvas = tokens.brand.canvas; // brand light surface — app background
const subtle = tokens.brand.textSecondary; // blue-gray, secondary text (7.43:1 — AAA)

// Editorial header: navy with a very subtle depth stop (not an "AI gradient").
const header = genPageTheme({ colors: [navy, navyDeep], shape: shapes.wave });

export const vertigoLight = createUnifiedTheme({
  palette: {
    ...palettes.light,
    primary: { main: blue },
    secondary: { main: navy },
    background: { default: canvas, paper: tokens.brand.paper },
    text: {
      primary: ink,
      secondary: subtle,
    },
    link: blueLink,
    linkHover: blue,
    navigation: {
      ...palettes.light.navigation,
      background: tokens.chrome,
      indicator: blueSoft,
      color: tokens.brand.sidebarText, // unselected items on chrome (AAA)
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
  components: makeComponents('light'),
});
