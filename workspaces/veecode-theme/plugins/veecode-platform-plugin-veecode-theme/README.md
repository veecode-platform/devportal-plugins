# veecode-platform-plugin-veecode-theme

The VeeCode visual identity for DevPortal, shipped as a frontend **dynamic plugin**
(Module Federation / Scalprum). The theme code lives here in `src/themes/`; this package
does not wrap an external theme package.

Exports:

- `VeecodeLightThemeProvider` — an `@backstage/theme` `UnifiedThemeProvider` for `veecodeLight`
- `VeecodeDarkThemeProvider` — the same for `veecodeDark`
- `veecodeLight`, `veecodeDark` — the themes themselves
- `veecodeThemePlugin` — a thin `createPlugin` shell so the package satisfies the
  `frontend-plugin` role that the export tooling expects

`src/index.ts` also imports `src/styles/bui-tokens.css`, a small set of `--bui-*` token
overrides for surfaces rendered by `@backstage/ui`.

## Where this package lives

It is one workspace of the `veecode-platform/devportal-plugins` monorepo, at
`workspaces/veecode-theme/`. The workspace holds this single plugin: there is no hosting
app (`packages/`) and no container harness of its own. Agent-facing context for the
workspace is in [`AGENTS.md`](../../AGENTS.md).

## Naming

The package is `veecode-platform-plugin-veecode-theme` (unscoped). `rhdh-cli plugin export`
appends `-dynamic`, so the exported artifact is
`veecode-platform-plugin-veecode-theme-dynamic`, and that is the name a DevPortal
installation refers to. The Scalprum name declared in `package.json` is
`veecode-platform.plugin-veecode-theme`, which is the prefix used inside a
`dynamicPlugins.frontend` configuration block.

## Build

From the workspace root (`workspaces/veecode-theme/`):

```sh
make build-dynamic      # builds, then runs @red-hat-developer-hub/cli plugin export
```

This produces `plugins/veecode-platform-plugin-veecode-theme/dist-dynamic/`. `make help`
lists the other targets (`pack`, `publish`, `publish-dynamic`, `set-version VERSION=x.y.z`,
`get-version`, `clean`, `clean-dynamic`).

Only the export path bundles the CSS. `backstage-cli package build` (Rollup) fails on the
`bui-tokens.css` import, and `rhdh-cli plugin export` (webpack) handles it, building from
`src/`. The package's `main` and `types` therefore point at `src/index.ts`, with
`publishConfig` remapping them to `dist/` on publish.

## Enabling the theme

The exported artifact is enabled through the `dynamic-plugins` configuration of the
DevPortal installation, not by this package. A `themes:` block under
`dynamicPlugins.frontend.veecode-platform.plugin-veecode-theme` declares each provider with
an `importName` and an `id`:

```yaml
dynamicPlugins:
  frontend:
    veecode-platform.plugin-veecode-theme:
      themes:
        - id: light
          importName: VeecodeLightThemeProvider
        - id: dark
          importName: VeecodeDarkThemeProvider
```

Because the providers reuse the `light` and `dark` ids, the DevPortal shell drops the
built-in themes carrying those ids and uses these instead. The theme is not enabled by
default; which themes an installation turns on is decided by that installation.

## Caution on the BUI tokens

`@backstage/ui` is pre-1.0 and renames tokens in minor releases. The token and selector
names in `bui-tokens.css` were read from a 0.13.2 build and must be re-checked against the
version the host app actually resolves before being relied on. The file header records this
in full. Keep the override set small.
