<!-- Workspace context follows the repository standard in CONTRIBUTING.md. -->

## Commands

Run commands from `workspaces/vertigo-theme/`.

- `yarn install`, `yarn start`, `yarn tsc:full`, `yarn test:all`, `yarn test:e2e`, `yarn lint:all`, and `yarn prettier:check` are the harness gates.
- Use `yarn dev:dynamic` for the RHDH dynamic-plugin export. The plugin README explains the CSS/font export boundary.

## Layout

`packages/app` is the theme app harness. `plugins/vertigo-platform-plugin-vertigo-theme`
contains the frontend product, theme providers, and the global-header badge.

## Architecture

The product is a frontend plugin with light/dark providers and a header badge.
The static app registers the providers with `createApp`; `dynamic-plugins.yaml`
expresses the equivalent themes and mount-point contract.

## How to test

The app and Playwright smoke test prove the static harness. `yarn tsc:full` and
`yarn dev:dynamic` cover source and export evidence. Runtime dynamic loading is
separate and must use the `devportal-local` flow in `../../CONTRIBUTING.md`.

## Pull requests and changesets

Follow `../../CONTRIBUTING.md` and the plugin README. Keep provider names,
theme ids, and the header mount point synchronized; add changesets for
publishable product changes.
