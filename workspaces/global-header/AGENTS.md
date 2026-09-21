<!-- Workspace context follows the repository standard in CONTRIBUTING.md. -->

## Commands

Run commands from `workspaces/global-header/`.

- `yarn install`, `yarn start`, `yarn tsc:full`, `yarn build:all`, `yarn test:all`, `yarn test:e2e`, `yarn lint:all`, and `yarn prettier:check` are the workspace gates.
- Product package commands are available under `plugins/veecode-global-header`.

## Layout

`packages/app` and `packages/backend` provide the dev shell. The global-header
frontend product and its dynamic configuration live under `plugins/`.

## Architecture

The product contributes application-header components and the app harness mounts
them in a normal Backstage shell. Backend wiring belongs to the harness and is
not part of the frontend package.

## How to test

The frontend role is covered by the app and Playwright harness plus package
tests. Use the four proofs and official flow in `../../CONTRIBUTING.md` for
dynamic export and runtime evidence.

## Pull requests and changesets

Follow `../../CONTRIBUTING.md`. Add changesets for publishable product changes;
keep runtime configuration changes reviewable with the product change.
