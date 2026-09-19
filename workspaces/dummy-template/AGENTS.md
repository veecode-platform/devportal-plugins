<!-- This file is the source for generated workspace AGENTS.md files. -->

## Commands

Run commands from `workspaces/{{name}}/`.

- `yarn install` — install the workspace dependencies.
- `yarn {{primary_command}}` — run the role-sized development harness.
- `yarn tsc:full`, `yarn test:all`, `yarn prettier:check` — run the local gates.
- `yarn test:e2e` — run the Playwright harness. Set `PLAYWRIGHT_URL` when the
  portal is already running (for example, in `devportal-local`).
- `yarn dev:dynamic` — export the product and its dynamic-plugin configuration into
  the `devportal-local` proof runner; follow the complete Compose command it prints.

## Layout

`plugins/{{plugin_path}}` contains the `{{role}}` product package. The role-sized
harness is `{{harness_layout}}`. Product code stays under `plugins/`; the
harness contains only wiring, fixtures and verification code.

## Architecture

This workspace is generated from the repository workspace template. The product package is private
until it is registered through the export overlay. Keep workspace-only decisions in
`DECISIONS.md` and do not copy cross-workspace rules into this file.

## How to test

Use the [four proofs and official flow](../../CONTRIBUTING.md#the-four-proofs-and-the-official-test-flow).
For this `{{role}}`, proof 1 is `{{proof1}}`; proof 2 is `{{proof2}}`.
The Playwright configuration follows the upstream `PLAYWRIGHT_URL` convention:
without it, the workspace starts its own Backstage environment; with it, no
server is started and the tests target the supplied portal URL.
Build in `devportal-plugins`, prove in `devportal-local`, then publish through
`export-overlays`. No publication is needed for proof 2.

## Pull requests and changesets

Follow [Pull requests](../../CONTRIBUTING.md#pull-requests). Add a changeset when
the product package changes and record workspace-only decisions in `DECISIONS.md`.
