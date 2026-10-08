## Commands

Run commands from `workspaces/scaffolder-fields/`.

- `yarn install` — install the workspace dependencies.
- `yarn start` — run the role-sized development harness.
- `yarn tsc:full`, `yarn test:all`, `yarn prettier:check` — run the local gates.
- `yarn test:e2e` — run the Playwright harness. Set `PLAYWRIGHT_URL` when the
  portal is already running (for example, in `devportal-local`).
- `yarn dev:dynamic` — export the product and its dynamic-plugin configuration into
  the `devportal-local` proof runner; follow the complete Compose command it prints.

## Layout

`plugins/scaffolder-fields` contains the `frontend-plugin` product package. The role-sized
harness is `packages/app plus Playwright`. Product code stays under `plugins/`; the
harness contains only wiring, fixtures and verification code.

## Architecture

This workspace is generated from the repository workspace template. The product package is private
until it is registered through the export overlay. Keep workspace-only decisions in
`DECISIONS.md` and do not copy cross-workspace rules into this file.

## How to test

Use the [four proofs and official flow](../../CONTRIBUTING.md#the-four-proofs-and-the-official-test-flow).
For this `frontend-plugin`, proof 1 is `yarn test:all and the Playwright suite`; proof 2 is `the exported route renders in devportal-local`.
The Playwright configuration follows the upstream `PLAYWRIGHT_URL` convention:
without it, the workspace starts its own Backstage environment; with it, no
server is started and the tests target the supplied portal URL.
Build in `devportal-plugins`, prove in `devportal-local`, then publish through
`export-overlays`, in that order: run proofs 1 and 2 before publishing, and state it in
the overlay PR when you skip proof 2 on purpose. No publication is needed for proof 2.

## Pull requests and changesets

Follow [Pull requests](../../CONTRIBUTING.md#pull-requests). Add a changeset when
the product package changes and record workspace-only decisions in `DECISIONS.md`.
