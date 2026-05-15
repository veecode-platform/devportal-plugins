import {
  createUnifiedTheme,
  genPageTheme,
  palettes,
  shapes,
} from '@backstage/theme';
import { components } from './components';

const accent = '#00857a';
const accentBright = '#00b39b';
const sidebar = '#1b1f23';

const header = genPageTheme({ colors: [accent, accentBright], shape: shapes.wave });

/** The VeeCode light theme. POC palette — refined in ADR-011 phase E. */
export const veecodeLight = createUnifiedTheme({
  palette: {
    ...palettes.light,
    primary: { main: accent },
    secondary: { main: '#5a3fc0' },
    navigation: {
      ...palettes.light.navigation,
      background: sidebar,
      indicator: accentBright,
      color: '#d8d8d8',
      selectedColor: '#ffffff',
    },
  },
  defaultPageTheme: 'home',
  pageTheme: {
    home: header,
    documentation: genPageTheme({
      colors: ['#5a3fc0', '#8b6fe0'],
      shape: shapes.wave2,
    }),
    tool: header,
    service: header,
    website: header,
    library: header,
    other: header,
    app: header,
    apis: header,
  },
  components,
});
