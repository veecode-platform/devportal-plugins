/*
 * PARITY GATE — does the plugin build the same theme SHAPE the app-config route
 * builds, with Vertigo colours in it?
 *
 * Reference ("baseline"): the M5 tenant overlay block from
 * wt-m5-platform-infra/manifests/values.yaml.tpl (`variant: rhdh` + Vertigo
 * palette), i.e. the render state measured as correct on Atlas.
 * Candidate ("plugin"): the ThemeConfig this plugin feeds into the same factory,
 * plus the Vertigo component layer merged on top.
 *
 * Two different questions, checked separately:
 *  1. GEOMETRY/STRUCTURE must be identical — same component slots, same
 *     selectors, same margins/clip-paths/borders. This is what the 3.x shell's
 *     layout depends on, and what the regressed tag was missing.
 *  2. COLOUR is deliberately Vertigo, including the RHDH surface fields the
 *     app-config block leaves unset (they fell back to RHDH greys: cards and the
 *     main section painted #292929 on dark).
 *
 * Run: ./run.sh
 */
import assert from 'node:assert';

const PKG = '../../node_modules/@red-hat-developer-hub/backstage-plugin-theme/dist';

const { getDefaultThemeConfig } = await import(`${PKG}/rhdh.esm.js`);
const { migrateThemeConfig } = await import(`${PKG}/utils/migrateTheme.esm.js`);
const { mergeUnifiedThemeOptions } = await import(`${PKG}/utils/mergeTheme.esm.js`);
const { createPageThemes } = await import(`${PKG}/utils/createPageThemes.esm.js`);
const { createComponents } = await import(`${PKG}/utils/createComponents.esm.js`);

const { vertigoLightThemeConfig } = await import('./build/vertigoLight.js');
const { vertigoDarkThemeConfig } = await import('./build/vertigoDark.js');
const { makeComponents } = await import('./build/components.js');
const { mergeComponents } = await import('./build/mergeComponents.js');
const { tokens } = await import('./build/tokens.js');

/** Same pipeline as hooks/useThemeOptions.esm.js, minus the useMemo. */
const buildOptions = themeConfig => {
  const mode = themeConfig.mode ?? 'light';
  const defaults = getDefaultThemeConfig(mode);
  const merged = mergeUnifiedThemeOptions(defaults, migrateThemeConfig(themeConfig));
  return {
    palette: merged.palette,
    defaultPageTheme: merged.defaultPageTheme,
    fontFamily: merged.fontFamily,
    htmlFontSize: merged.htmlFontSize,
    typography: merged.typography,
    pageTheme: createPageThemes(merged),
    components: createComponents(merged),
  };
};

// ---- the app-config reference (values.yaml.tpl:62-96), verbatim -------------
const baselineConfig = mode => ({
  variant: 'rhdh',
  mode,
  palette:
    mode === 'light'
      ? {
          primary: { main: '#076cfe' },
          secondary: { main: '#0c1557' },
          background: { default: '#f3f5f8', paper: '#ffffff' },
          text: { primary: '#101820', secondary: '#445067' },
          navigation: {
            background: '#161d2e',
            indicator: '#4d94ff',
            color: '#c3c8db',
            selectedColor: '#ffffff',
          },
          rhdh: {
            general: {
              sidebarBackgroundColor: '#161d2e',
              sidebarItemSelectedBackgroundColor: '#076cfe',
            },
          },
        }
      : {
          primary: { main: '#4d94ff' },
          secondary: { main: '#9db4ff' },
          background: { default: '#101820', paper: '#17202b' },
          text: { primary: '#eef1fb', secondary: '#a6adca' },
          navigation: {
            background: '#161d2e',
            indicator: '#4d94ff',
            color: '#c3c8db',
            selectedColor: '#ffffff',
          },
          rhdh: {
            general: {
              sidebarBackgroundColor: '#161d2e',
              sidebarItemSelectedBackgroundColor: '#4d94ff',
            },
          },
        },
});

/*
 * Colour-blind structural comparison: any string carrying a colour (a hex, an
 * rgb()/rgba()/hsl(), so also `1px solid rgba(...)` and box-shadow strings)
 * collapses to a placeholder. What survives is the shape: slots, selectors, and
 * geometric values like `margin: 1.5rem` or `clipPath: rect(... round 1rem)`.
 */
const COLORISH = /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i;
const stripColors = value => {
  if (typeof value === 'string') return COLORISH.test(value) ? '<colorish>' : value;
  if (Array.isArray(value)) return value.map(stripColors);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, stripColors(v)]),
    );
  }
  return value;
};

/*
 * DECLARED departures from the reference geometry (product decisions, each one
 * measured). They are merged into the baseline before the structural comparison,
 * so they are documented in exactly one place and ANY other structural drift
 * still fails the gate.
 */
const INTENTIONAL_GEOMETRY = {
  // content flush against the sidebar (shell's hardcoded 27px seam)
  RHDHPageWithoutFixHeight: {
    styleOverrides: {
      sidebarLayout: { '@media (min-width: 600px)': { '& > div': { marginLeft: 0 } } },
    },
  },
  // no drawer right border, or it would overlap the flush content
  BackstageSidebar: { styleOverrides: { drawer: { borderRight: 'none' } } },
  // content fills the page: no page-inset margin, no rounded corners
  BackstageSidebarPage: {
    styleOverrides: {
      root: {
        '@media (min-width: 600px)': {
          "& > [class*='MuiLinearProgress-root'], & > main": {
            margin: 0,
            maxHeight: '100vh',
            clipPath: 'none',
          },
        },
      },
    },
  },
};

// Slots the 3.x shell's layout and chrome come from. Structural divergence here
// IS the regression (27px seam, invisible dark icon, tabs/header).
const CHROME_SLOTS = [
  'BackstageSidebar',
  'BackstageSidebarItem',
  'BackstageSidebarPage',
  'RHDHPageWithoutFixHeight',
  'BackstageContent',
  'BackstageContentHeader',
  'BackstageHeader',
  'MuiTabs',
  'MuiTab',
];

// Slots BOTH layers write. Vertigo may WIN on a value, never delete an RHDH key —
// a shallow spread instead of the deep merge would do exactly that.
const SHARED_SLOTS = [
  'MuiAppBar',
  'MuiCssBaseline',
  'MuiPaper',
  'MuiCard',
  'MuiButton',
  'MuiIconButton',
  'MuiChip',
  'MuiOutlinedInput',
  'MuiSelect',
  'MuiDialog',
  'MuiMenu',
  'MuiMenuItem',
  'MuiTableCell',
  'MuiTableRow',
  'MuiLink',
  'MuiDivider',
  'MuiTooltip',
  'MuiTypography',
];

const hexToRgb = hex => {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

const failures = [];
const check = (label, fn) => {
  try {
    fn();
    console.log(`  ok   ${label}`);
  } catch (err) {
    failures.push(`${label}: ${err.message.split('\n')[0]}`);
    console.log(`  FAIL ${label}`);
    console.log(`       ${err.message.split('\n').slice(0, 8).join('\n       ')}`);
  }
};

for (const [mode, pluginConfig] of [
  ['light', vertigoLightThemeConfig],
  ['dark', vertigoDarkThemeConfig],
]) {
  console.log(`\n[${mode}]`);
  const baseline = buildOptions(baselineConfig(mode));
  const raw = buildOptions(pluginConfig);
  const plugin = {
    ...raw,
    components: mergeComponents(raw.components, makeComponents(mode)),
  };
  const brand = mode === 'dark' ? tokens.brand.dark : tokens.brand;
  const canvas = mode === 'dark' ? tokens.brand.dark.canvas : tokens.brand.canvas;
  const paper = mode === 'dark' ? tokens.brand.dark.paper : tokens.brand.paper;

  // ---- 1. geometry / structure identical to the reference render ------------
  const expected = mergeComponents(baseline.components, INTENTIONAL_GEOMETRY);
  for (const slot of CHROME_SLOTS) {
    check(`components.${slot} structurally identical (+ declared departures)`, () =>
      assert.deepStrictEqual(
        stripColors(plugin.components[slot]),
        stripColors(expected[slot]),
      ),
    );
  }
  check('content is flush on all four sides, no rounding', () => {
    const card =
      plugin.components.BackstageSidebarPage.styleOverrides.root[
        '@media (min-width: 600px)'
      ]["& > [class*='MuiLinearProgress-root'], & > main"];
    assert.strictEqual(card.margin, 0, `margin: ${card.margin}`);
    assert.strictEqual(card.clipPath, 'none');
    assert.strictEqual(card.maxHeight, '100vh');
    const layout =
      plugin.components.RHDHPageWithoutFixHeight.styleOverrides.sidebarLayout[
        '@media (min-width: 600px)'
      ]['& > div'];
    assert.strictEqual(layout.marginLeft, 0);
    assert.strictEqual(
      plugin.components.BackstageSidebar.styleOverrides.drawer.borderRight,
      'none',
    );
  });
  check('page inset token still declared (root background)', () =>
    assert.strictEqual(
      plugin.palette.rhdh.general.pageInset,
      baseline.palette.rhdh.general.pageInset,
    ),
  );
  check('defaultPageTheme identical', () =>
    assert.strictEqual(plugin.defaultPageTheme, baseline.defaultPageTheme),
  );
  check('RHDH type scale preserved (h1 fontSize)', () =>
    assert.strictEqual(
      plugin.typography.h1.fontSize,
      baseline.typography.h1.fontSize,
    ),
  );
  for (const slot of SHARED_SLOTS) {
    const baseSlot = baseline.components[slot];
    if (!baseSlot) continue;
    check(`components.${slot} keeps every RHDH key`, () => {
      const droppedSlots = Object.keys(baseSlot).filter(
        k => !(k in (plugin.components[slot] ?? {})),
      );
      assert.deepStrictEqual(droppedSlots, [], `dropped: ${droppedSlots}`);
      const missing = Object.keys(baseSlot.styleOverrides ?? {}).filter(
        k => !(k in (plugin.components[slot].styleOverrides ?? {})),
      );
      assert.deepStrictEqual(missing, [], `styleOverrides dropped: ${missing}`);
    });
  }

  // ---- 2. colour identity: the parity keys match app-config ----------------
  for (const key of ['primary', 'secondary', 'background', 'text']) {
    check(`palette.${key} identical to app-config`, () =>
      assert.deepStrictEqual(plugin.palette[key], baseline.palette[key]),
    );
  }
  // navigation: the app-config keys must match; navItem/submenu are the declared
  // interaction-state departures asserted further down.
  check('palette.navigation (app-config keys) identical', () => {
    for (const k of ['background', 'indicator', 'color', 'selectedColor']) {
      assert.strictEqual(
        plugin.palette.navigation[k],
        baseline.palette.navigation[k],
        `navigation.${k}`,
      );
    }
  });
  check('sidebar background identical to app-config', () =>
    assert.strictEqual(
      plugin.palette.rhdh.general.sidebarBackgroundColor,
      baseline.palette.rhdh.general.sidebarBackgroundColor,
    ),
  );
  /*
   * Sidebar interaction states. The RHDH defaults for the hover
   * (`navigation.navItem.hoverBackground`) are OPAQUE — #ffffff light / #292929
   * dark — which put a white/grey block behind the light sidebar label. Hover is
   * a translucent wash and must differ from the selected background.
   */
  check('sidebar hover is translucent and != selected', () => {
    const hover = plugin.palette.navigation.navItem.hoverBackground;
    assert.match(hover, /^rgba\(/, `hover not translucent: ${hover}`);
    assert.notStrictEqual(
      hover,
      plugin.palette.rhdh.general.sidebarItemSelectedBackgroundColor,
    );
    for (const grey of ['#ffffff', '#FFF', '#292929']) {
      assert.notStrictEqual(hover.toLowerCase(), grey.toLowerCase());
    }
  });
  check('selected sidebar item uses the deeper brand blue in light', () =>
    assert.strictEqual(
      plugin.palette.rhdh.general.sidebarItemSelectedBackgroundColor,
      mode === 'dark' ? tokens.brand.dark.primary : tokens.brand.link,
    ),
  );
  /*
   * Page header band: the RHDH default page theme paints
   * `linear-gradient(#292929)` on dark, which is the grey header band. Must be a
   * brand surface, and must stay a FLAT colour (no shapes.wave).
   */
  /*
   * Page header band: the branded navy band with the wave (the VeeCode 2.x look).
   * The RHDH default paints a flat `linear-gradient(#292929)` on dark — the grey
   * band. Assert the brand navy is there AND that the shape actually resolved to
   * an SVG (a typo in `shape` silently falls through to `none` in createPageTheme).
   */
  check('page header band is the branded navy wave', () => {
    const pt = plugin.pageTheme.default;
    assert.ok(pt, 'no default page theme');
    const img = pt.backgroundImage.toLowerCase();
    assert.ok(
      img.includes(tokens.brand.navy.toLowerCase()) ||
        img.includes(hexToRgb(tokens.brand.navy)),
      `not brand navy: ${img.slice(0, 80)}`,
    );
    assert.ok(img.includes('svg'), 'wave shape did not resolve');
    assert.strictEqual(pt.fontColor, tokens.brand.paper);
  });
  // structurally the band must stay ONE entry, like the RHDH default (the first
  // build had 9 per-kind entries)
  check('single page theme entry (same shape as RHDH config)', () =>
    assert.deepStrictEqual(
      Object.keys(plugin.pageTheme),
      Object.keys(baseline.pageTheme),
    ),
  );

  // ---- 4. the Vertigo layer is still applied ------------------------------
  check('Vertigo layer applied (MuiCard radius)', () =>
    assert.strictEqual(
      plugin.components.MuiCard.styleOverrides.root.borderRadius,
      12,
    ),
  );
  check('Vertigo font family applied', () =>
    assert.ok(String(plugin.fontFamily).includes('Geist Sans')),
  );

  // ---- 5. the dark-mode invisible-icon bug -------------------------------
  check('selected sidebar item icon != its background', () => {
    const drawer = plugin.components.BackstageSidebar.styleOverrides.drawer;
    const rule =
      drawer['#rhdh-sidebar-layout & a[aria-current="page"], & a[aria-current="page"]'];
    const bg = rule.backgroundColor.replace(' !important', '');
    const fg = rule.color.replace(' !important', '');
    assert.notStrictEqual(fg, bg);
    assert.strictEqual(fg, brand === tokens.brand.dark ? '#ffffff' : '#ffffff');
  });
}

/*
 * Counter-test: the gate must FAIL for the shape the regressed tag shipped —
 * a bare `createUnifiedTheme` whose components are only the Vertigo layer, with
 * no RHDH component layer under it. That is the cause of the 27px seam: the
 * shell's `marginLeft: 27px` on BackstageSidebarPage-root is only compensated
 * (and the drawer only painted up to it) by RHDH's BackstageSidebarPage /
 * BackstageSidebar overrides.
 */
console.log('\n[counter-test: pre-fix shape]');
const preFix = makeComponents('dark');
check('Vertigo-only layer carries NO RHDH layout rules (so the gate is meaningful)', () => {
  /*
   * The Vertigo layer does touch three layout slots (the declared departures),
   * but it must never be a SUBSTITUTE for the RHDH layer: it may only cancel
   * things (margin 0, clipPath none, borderRight none), never carry the rules the
   * shell's layout depends on. Concretely: no `& nav ~ main` margin reset, no
   * page-inset arithmetic, and no painting of the drawer or the selected item.
   */
  const media =
    preFix.BackstageSidebarPage?.styleOverrides?.root?.['@media (min-width: 600px)'] ?? {};
  assert.ok(!('& nav' in media), 'Vertigo layer defines the nav~main margin reset');
  const flat = JSON.stringify(preFix);
  assert.ok(!flat.includes('calc('), 'Vertigo layer carries inset arithmetic');
  assert.ok(!flat.includes('pageInset'), 'Vertigo layer carries pageInset');
  const card = media["& > [class*='MuiLinearProgress-root'], & > main"] ?? {};
  assert.strictEqual(card.margin, 0, 'Vertigo layer sets a non-zero page inset');
  const drawer = preFix.BackstageSidebar?.styleOverrides?.drawer ?? {};
  assert.ok(!('backgroundColor' in drawer), 'Vertigo layer paints the drawer');
  assert.ok(
    !Object.keys(drawer).some(k => k.includes('aria-current')),
    'Vertigo layer paints the selected item',
  );
  assert.strictEqual(preFix.BackstageContent, undefined, 'BackstageContent came back');
});

console.log('');
if (failures.length) {
  console.log(`FAILED (${failures.length}):`);
  failures.forEach(f => console.log(` - ${f}`));
  process.exit(1);
}
console.log('PARITY OK');
