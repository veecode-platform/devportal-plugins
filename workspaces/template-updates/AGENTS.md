## Commands

Run commands from `workspaces/template-updates/`.

- `yarn install` — install the workspace dependencies.
- `yarn start` — run the scaffolder dev shell.
- `yarn tsc:full`, `yarn lint:all`, `yarn prettier:check`, `yarn test:all` — run the workspace gates.
- `yarn workspace @veecode-platform/plugin-scaffolder-backend-module-template-update export-dynamic` — create `dist-dynamic/` for the product module.
- `yarn dev:dynamic` — export the module for the local runner; follow the printed runner instructions.

## Layout

`plugins/scaffolder-backend-module-template-update` contains the
`backend-plugin-module` product. `packages/backend` is the dev shell and registers
the module with the Scaffolder backend. The shell contains only wiring and
development configuration.

## Architecture

The module registers three Scaffolder actions: `veecode:template:read-record`,
`veecode:template:merge`, and `veecode:template:publish-mr`. The example template
is `examples/update-from-template/template.yaml`.

The repository scaffold does not support the `backend-plugin-module` role. This
workspace uses its `backend-plugin` shell-only scaffold, then adds the module
package following the existing Scaffolder module shape. See PDR-001 in
`DECISIONS.md`.

## How to test

Use the [four proofs and official flow](../../CONTRIBUTING.md#the-four-proofs-and-the-official-test-flow).
Proof 1 is the module's unit suite plus a running dev shell whose
`GET /api/scaffolder/v2/actions` response lists all three action IDs. Proof 2
uses the same action list endpoint in `devportal-local`.

## Pull requests and changesets

Follow [Pull requests](../../CONTRIBUTING.md#pull-requests). Add a changeset when
the product package changes and record workspace-only decisions in
`DECISIONS.md`.
