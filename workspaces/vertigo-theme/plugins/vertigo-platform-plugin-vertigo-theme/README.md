# vertigo-platform-plugin-vertigo-theme

The Vertigo DevPortal theme: a frontend **dynamic plugin** (Module Federation / Scalprum)
that replaces the built-in light and dark themes with Vertigo Light and Vertigo Dark, and
mounts a small brand badge into the global header.

Exports:

- `VertigoLightThemeProvider` — an `@backstage/theme` `UnifiedThemeProvider`, theme id `light`
- `VertigoDarkThemeProvider` — the same, theme id `dark`
- `vertigoLight`, `vertigoDark` — the themes themselves
- `VertigoHeaderBadge` — a brand pill for the `global.header/component` mount point
- `vertigoThemePlugin` — a thin `createPlugin` shell so the package satisfies the
  `frontend-plugin` role that the export tooling expects

Design scales live in `src/themes/tokens.ts` as the single source of truth, component
overrides in `src/themes/components.ts` through a `makeComponents(mode)` factory, typography
in `src/themes/typography.ts`, and global CSS for the legacy MUI v4 layer in
`src/styles/component-fixes.css`. The Geist Sans faces are self-hosted through
`@fontsource/geist-sans` and imported from `src/index.ts` so they are bundled into the
artifact.

## Where this package lives

It is one workspace of the `veecode-platform/devportal-plugins` monorepo, at
`workspaces/vertigo-theme/`. The workspace holds this single plugin: there is no hosting app
(`packages/`) and no container harness of its own. Agent-facing context for the workspace is
in [`AGENTS.md`](../../AGENTS.md).

## Naming

The package is `vertigo-platform-plugin-vertigo-theme` (unscoped). `rhdh-cli plugin export`
appends `-dynamic`, so the exported artifact is
`vertigo-platform-plugin-vertigo-theme-dynamic`. The Scalprum name declared in
`package.json` is `vertigo-platform.plugin-vertigo-theme`, the prefix used inside a
`dynamicPlugins.frontend` configuration block.

## The 3.x layout contract (`palette.rhdh.general`)

Both themes carry an `rhdh.general` block in their palette, because the DevPortal 3.x app
shell does layout arithmetic with those fields. Without them a `calc()` in the shell
resolves against `undefined`, which shows up as a gap between sidebar and content, a shift
when Administration expands, and a full-height loader.

Read against `veecode-platform/devportal-core` `main` at commit `ba59e659` (2026-08-26):

| Field | Read by |
|-------|---------|
| `pageInset` | `packages/app/src/components/Root/Root.tsx:171` (docked-drawer margin calculation) |
| `sidebarBackgroundColor` | `packages/app/src/components/Root/ResizableDrawer.tsx:117` (drawer paper) |
| `sidebarItemSelectedBackgroundColor` | `packages/app/src/components/Root/CustomSidebarItem.tsx:62` and `packages/app/src/hooks/useThemedConfig.ts:82` |
| `appBarBackgroundScheme` | `packages/app/src/hooks/useThemedConfig.ts:20` (logo variant) |

The themes also set `appBarBackgroundColor` and `appBarForegroundColor`; no file in that
shell commit reads them, so treat them as forward-looking rather than load-bearing.

The `palette` object is built as a separate constant so the extra `rhdh` key passes through
`createUnifiedTheme` untouched, since MUI's `createPalette` deep-merges unknown palette keys
while an inline literal would trip the TypeScript excess-property check. `navigation.background`
stays set to the same chrome colour, because the core-components `Sidebar` reads that while
`rhdh.general.sidebarBackgroundColor` feeds the 3.x drawer. The `--bui-bg-app` override in
`component-fixes.css` paints the brand canvas, which is the one surface configuration cannot
reach.

This plugin is the single source of truth for the Vertigo look on 3.x. A tenant overlay must
not stack an `app.branding.theme.*.palette` block on top of it; the two would fight.

## Build

From the workspace root (`workspaces/vertigo-theme/`):

```sh
make build-dynamic      # builds, then runs @red-hat-developer-hub/cli plugin export
```

This produces `plugins/vertigo-platform-plugin-vertigo-theme/dist-dynamic/`. `make help`
lists the other targets (`pack`, `publish`, `publish-dynamic`, `set-version VERSION=x.y.z`,
`get-version`, `clean`, `clean-dynamic`).

Only the export path bundles the CSS and the font files. `backstage-cli package build`
(Rollup) fails on the CSS imports in `src/index.ts`, and `rhdh-cli plugin export` (webpack)
handles them.

## Enabling the theme

The exported artifact is enabled through the `dynamic-plugins` configuration of the
DevPortal installation, not by this package. The providers are declared in a `themes:` block
and the badge in a `mountPoints:` block:

```yaml
dynamicPlugins:
  frontend:
    vertigo-platform.plugin-vertigo-theme:
      themes:
        - id: light
          importName: VertigoLightThemeProvider
        - id: dark
          importName: VertigoDarkThemeProvider
      mountPoints:
        - mountPoint: global.header/component
          importName: VertigoHeaderBadge
```

Because the providers reuse the `light` and `dark` ids, the shell drops the built-in themes
carrying those ids. The theme is not enabled by default; which themes an installation turns
on is decided by that installation.

## Known limitation: sidebar icons

Only a couple of the sidebar icons pass through the app's icon registry; the rest are baked
into the shell image. Swapping just the reachable ones leaves the icon set visually mixed, so
this package does not attempt it. A complete icon set requires a change in the image.
