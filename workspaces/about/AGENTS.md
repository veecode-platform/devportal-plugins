<!-- Workspace context follows the repository standard in CONTRIBUTING.md. -->

## Commands

Run commands from `workspaces/about/`.

- `yarn install`, `yarn start`, `yarn tsc:full`, `yarn build:all`, `yarn test:all`, `yarn test:e2e`, `yarn lint:all`, and `yarn prettier:check` are the workspace gates.
- `packages/app` and `packages/backend` are the local dev shell; the product packages have their own package-level `start`, `build`, `test`, and `lint` scripts.
- `make build-dynamic` is the legacy multi-package export helper. The official delivery rules are in the repository contribution guide.

## Layout

`packages/app` is the frontend harness and `packages/backend` is the backend
harness. `plugins/about` and `plugins/about-backend` are the product packages;
the root configuration and `dynamic-plugins.yaml` describe local loading.

## Architecture

The frontend exposes the About page and the backend supplies the corresponding
Backstage backend feature. Harness code stays in `packages/`; product behavior
stays in `plugins/`. The workspace declares Backstage `1.52.0`.

## How to test

The frontend role is covered by the app harness and Playwright smoke test; the
backend role is covered by the backend harness and package tests. Use the four
proofs and official flow documented in `../../CONTRIBUTING.md`.

## Pull requests and changesets

Follow `../../CONTRIBUTING.md`. Product changes require a changeset when the
repository contribution rules call for one; keep workspace-only decisions in a
workspace decision record.
