<!-- Workspace context follows the repository standard in CONTRIBUTING.md. -->

## Commands

Run commands from `workspaces/veecode-theme/`.

- `yarn install`, `yarn start`, `yarn tsc:full`, `yarn test:all`, `yarn test:e2e`, `yarn lint:all`, and `yarn prettier:check` are the harness gates.
- No unit tests: a theme's behaviour is its rendering, proven by `yarn test:e2e` and in the runner. `yarn test:all` passing with no tests found is expected (plugins ADR-0011 §4).
- Use `yarn dev:dynamic` for the official RHDH dynamic-plugin export. The plugin README explains why the CSS-bearing package is not validated through the Rollup package build.

## Layout

`packages/app` is the theme app harness. `plugins/veecode-platform-plugin-veecode-theme`
contains the frontend product and exports the light/dark providers.

## Architecture

The product is a frontend plugin whose payload is the two theme providers. The
static app registers those providers with `createApp`; `dynamic-plugins.yaml`
expresses the equivalent RHDH `themes` contract. Do not add a second theme
implementation to the harness.

## How to test

The app and Playwright smoke test prove the static theme harness. `yarn tsc:full`
and `yarn dev:dynamic` cover source and export evidence. See the [four proofs and
official flow](../../CONTRIBUTING.md#the-four-proofs-and-the-official-test-flow).

## Pull requests and changesets

Follow `../../CONTRIBUTING.md` and the plugin README. Keep provider import names,
theme ids, and the dynamic config synchronized; add changesets for publishable
product changes.
