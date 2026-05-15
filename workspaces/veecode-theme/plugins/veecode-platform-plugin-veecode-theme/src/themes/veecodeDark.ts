import {
  createUnifiedTheme,
  genPageTheme,
  palettes,
  shapes,
} from '@backstage/theme';
import { components } from './components';

const accent = '#2ec8b6';
const accentBright = '#00b39b';
const sidebar = '#1b1f23';

const header = genPageTheme({ colors: [sidebar, '#0f3d39'], shape: shapes.wave });

/** The VeeCode dark theme. POC palette — refined in ADR-011 phase E. */
export const veecodeDark = createUnifiedTheme({
  palette: {
    ...palettes.dark,
    primary: { main: accent },
    secondary: { main: '#8b6fe0' },
    navigation: {
      ...palettes.dark.navigation,
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
      colors: ['#241f3d', '#3a3060'],
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
