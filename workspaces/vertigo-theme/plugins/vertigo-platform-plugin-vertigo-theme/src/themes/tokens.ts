// src/themes/tokens.ts — fonte única de escalas do tema Vertigo. Sem import de MUI.
const navyRGB = '12, 21, 87'; // #0c1557

export const tokens = {
  brand: {
    navy: '#0c1557', navyDeep: '#0a1145', blue: '#076cfe', link: '#0a5fd9',
    ink: '#101820', canvas: '#f3f5f8', paper: '#ffffff', textSecondary: '#445067',
    sidebarText: '#c3c8db',
    dark: { canvas: '#101820', paper: '#17202b', primary: '#4d94ff', text: '#eef1fb', textSecondary: '#a6adca' },
  },
  // Chrome (sidebar / persistent frame): a desaturated graphite-navy that sits
  // between the near-black canvas (#101820) and the brand blue-gray (#222d3b) —
  // reads as navy chrome without the electric high-chroma of #0c1557, so the
  // blue accent (active state) pops instead of competing.
  chrome: '#161d2e',
  chromeDeep: '#0f1523', // submenu / a subtle depth stop
  // Hairline: navy-tinted on light surfaces; a light cool tint on dark surfaces
  // (a navy hairline is invisible on dark paper — hairlineDark restores it).
  hairline: `rgba(${navyRGB}, 0.10)`,
  hairlineDark: 'rgba(233, 238, 252, 0.13)',
  radius: { sm: 6, md: 8, lg: 12 },
  density: { rowHeight: 44, inputHeight: 40, buttonHeight: 36, cardPadding: 24 },
  state: {
    hoverOverlay: `rgba(${navyRGB}, 0.05)`,
    hoverOverlayDark: 'rgba(233, 238, 252, 0.06)',
    focusRing: '#076cfe',
    disabledOpacity: 0.38,
  },
  // Soft-but-defined navy-tinted shadow for light surfaces.
  elevation: {
    e0: 'none',
    e1: `0 1px 2px rgba(${navyRGB}, 0.05), 0 4px 12px rgba(${navyRGB}, 0.06)`,
    e2: `0 2px 4px rgba(${navyRGB}, 0.06), 0 12px 28px rgba(${navyRGB}, 0.10)`,
  },
  // On dark, navy shadows vanish — use a black-navy base so elevation still reads.
  elevationDark: {
    e0: 'none',
    e1: '0 1px 2px rgba(4, 7, 15, 0.50), 0 4px 12px rgba(4, 7, 15, 0.45)',
    e2: '0 2px 4px rgba(4, 7, 15, 0.55), 0 12px 28px rgba(4, 7, 15, 0.55)',
  },
} as const;

export type Tokens = typeof tokens;
export type ThemeMode = 'light' | 'dark';
