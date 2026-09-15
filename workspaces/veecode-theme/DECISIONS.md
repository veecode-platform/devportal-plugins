# Plugin Decision Records

Workspace-local design decisions for `veecode-theme`, numbered `PDR-001`, `PDR-002`, … and
cited outside this workspace as `veecode-theme PDR-NNN`. They are plugin decision records,
not ADRs: decisions with cross-workspace or lasting weight live in the planning repository
`veecode-platform/devportal-plugins-parent` as `plugins ADR-NNNN`.

## PDR-001: The VeeCode Theme Is Delivered as a Dynamic Plugin That Replaces the Stock Themes

**Date:** decisions taken during the 3.x work (2026-08); recorded here 2026-09-15
**Status:** Accepted

Three mechanism decisions govern how this theme reaches a running portal. They were taken
together and only make sense together.

**1. The theme ships as a dynamic plugin, not as configuration or an environment variable.**
The 2.x portal accepted a theme through `PLATFORM_DEVPORTAL_THEME_URL`,
`THEME_DOWNLOAD_URL` and `THEME_CUSTOM_JSON`. Those were removed; the image's entrypoint now
only warns when it still sees them. The theme is ordinary plugin code, built and versioned
like any other package in this monorepo.

**2. The providers register under the existing `light` and `dark` theme ids.** The
installation's `dynamicPlugins.frontend` configuration declares
`{ id: light, importName: VeecodeLightThemeProvider }` and the dark equivalent. Because the
ids collide with the built-in ones, the shell **drops the stock themes carrying those ids and
uses these instead**, rather than adding a third and fourth entry to the theme picker. The
count of buttons in the picker is therefore not evidence that the mechanism worked; the
rendered palette is.

**3. The brand CSS ships inside the Module Federation bundle.** `src/styles/bui-tokens.css`
is imported from `src/index.ts`, so it loads when the remote loads, which is after the app's
own static `@backstage/ui` stylesheet. That ordering is the whole point: it is what lets the
overrides win on cascade order. The criterion this has to satisfy is that the bundle's CSS is
actually injected and does win; if it ever does not, the fallback is to move the import into
the hosting app instead of shipping it here.

A consequence of the third decision: the CSS import breaks `backstage-cli package build`,
which runs Rollup. That is accepted rather than worked around, because the dynamic-plugin
path does not use it. `rhdh-cli plugin export` builds from `src/` through webpack, which
handles the CSS, and the export depends only on `tsc`.

**Rationale:** delivering a theme as a plugin puts it under the same versioning, export and
review as the rest of the fleet, and removes a bespoke download path from the image. Colliding
on the ids is what makes it a *replacement* rather than an extra choice the user has to make,
which is what a product theme has to be. Shipping the CSS inside the bundle keeps the brand
override with the code that needs it, at the cost of depending on load order.

### Known limitations of the current implementation

These are recorded as facts about the code, not as decisions:

- **The palette is proof-of-concept quality.** The values in `src/themes/veecodeLight.ts` and
  `veecodeDark.ts` were accepted as-is to ship, and refining them is outstanding work.
- **The dark-mode selector is wrong.** `bui-tokens.css` scopes its dark overrides with
  `[data-theme='dark']`, which is not the selector `@backstage/ui` ^0.14 uses. The dark-mode
  token overrides therefore do not apply today. This is recorded as an open item in the fork
  mission's planning repository as well.
- **`@backstage/ui` is pre-1.0 and renames tokens in minor releases.** The token and selector
  names here were read from a 0.13.2 build while the app resolves ^0.14. Re-check them against
  the version the host actually resolves before relying on them, and keep the override set
  small.
- **The themes do not implement the `palette.rhdh.general` contract** that the 3.x app shell
  reads for its layout arithmetic. The sibling `vertigo-theme` workspace was built against
  that contract and carries the field-by-field mapping.

Whether an installation enables this theme is configured by that installation and is not
decided here.
