# veecode-platform-plugin-veecode-theme

The VeeCode visual identity, shipped as a frontend **dynamic plugin** (Module
Federation / Scalprum). Exports two `@backstage/theme` `UnifiedThemeProvider`
wrappers — `VeecodeLightThemeProvider` and `VeecodeDarkThemeProvider` — plus a
small `--bui-*` token override for `@backstage/ui`-rendered surfaces.

Not a wrapper around an external package — the theme code lives here (`src/themes/`).
Per ADR-011 phase 1 it will later be extracted into a versioned
`@veecode-platform/` package; for now it stays in this workspace.

> **Naming.** This wrapper package is `veecode-platform-plugin-veecode-theme`.
> `rhdh-cli plugin export` appends `-dynamic`, so the *exported artifact* (and
> the name referenced in `dynamic-plugins.default.yaml` / `presets/veecode-theme.yaml`)
> is `veecode-platform-plugin-veecode-theme-dynamic`. Same convention as e.g.
> `backstage-community-plugin-tech-radar` → `…-tech-radar-dynamic`.

## How it's wired

- `dynamic-plugins.default.yaml` carries the exported artifact
  (`veecode-platform-plugin-veecode-theme-dynamic`) `disabled: true` with a
  `dynamicPlugins.frontend.veecode-platform.plugin-veecode-theme.themes:` block
  declaring `{ id: light | dark, importName: Veecode{Light,Dark}ThemeProvider }`.
  The `DynamicRoot` shell discovers those providers and — because they reuse the
  `light`/`dark` ids — drops the like-id static themes and uses these instead.
- `presets/veecode-theme.yaml` flips it `disabled: false` (and sets
  `app.branding` logos). Compose it: `VEECODE_PRESETS=recommended,veecode-theme`.
  A customer ships their own look by replacing `veecode-theme` in that list with
  their own `<company>-theme` preset pointing at their own theme plugin.

## Build

```bash
cd dynamic-plugins
yarn workspace veecode-platform-plugin-veecode-theme tsc
yarn workspace veecode-platform-plugin-veecode-theme export-dynamic   # rhdh-cli plugin export → dist-dynamic/
# then copy dist-dynamic/ into the dynamic-plugins-root as
#   <dynamic-plugins-root>/veecode-platform-plugin-veecode-theme-dynamic/
```

`backstage-cli package build` (the `build` script / Rollup) currently errors on
the `src/styles/bui-tokens.css` import and is **not** needed — `rhdh-cli plugin
export` (webpack) builds straight from `src/` and handles the CSS. See ADR-011
(`docs/adr/011-frontend-design-system.md`) for the rationale and the validation
criteria this plugin must satisfy.
