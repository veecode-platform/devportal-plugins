<!-- Workspace context follows the repository standard in CONTRIBUTING.md. -->

## Commands

Run commands from `workspaces/veecode-homepage/`.

- `yarn install`, `yarn start`, `yarn tsc:full`, `yarn build:all`, `yarn test:all`, `yarn test:e2e`, `yarn lint:all`, and `yarn prettier:check` are the workspace gates.
- Product package commands are available under `plugins/`.

## Layout

`packages/app` and `packages/backend` are the dev shell. `plugins/veecode-homepage`
is the frontend product; the MUI compatibility packages are auxiliary frontend
fixtures used by the app.

## Architecture

The homepage product is a frontend plugin consumed by the app shell. The MUI
fixtures remain separate packages and are proven through the same app harness;
they are not folded into the homepage product.

## How to test

Frontend proof uses the app, Playwright harness, and package tests. Use the four
proofs and official flow in `../../CONTRIBUTING.md`; dynamic export and runtime
loading remain separate evidence.

## Pull requests and changesets

Follow `../../CONTRIBUTING.md`. Keep branding/configuration changes next to the
affected product package and add changesets for publishable changes.
