<!-- This file follows the mandatory workspace template; see [CONTRIBUTING.md](../../CONTRIBUTING.md). -->

## Commands

Run commands from `workspaces/kong-tools/`.

- Workspace scripts: `yarn install`, `yarn start`, `yarn tsc`, `yarn tsc:full`, `yarn build:all`, `yarn test:all --watchAll=false`, `yarn test:all --coverage`, `yarn test:e2e`, `yarn lint:all`, and `yarn prettier:check`.
- In `plugins/kong-service-manager`, `plugins/kong-service-manager-backend`, or `plugins/scaffolder-field-extensions-kong`: `yarn start`, `yarn build`, `yarn test --watchAll=false`, and `yarn lint`.
- In `plugins/kong-service-manager-common` or `plugins/scaffolder-backend-module-kong`: `yarn build`, `yarn test --watchAll=false`, and `yarn lint`.
- Makefile targets: `make help`, `make build`, `make build-dynamic`, `make pack`, `make pack-dynamic`, `make clean`, and `make clean-dynamic`.
- The Makefile also defines `make set-version VERSION=x.y.z`. npm publishing is retired; plugins now ship through the export overlay (OCI). The official delivery rules are in [Pull requests](../../CONTRIBUTING.md#pull-requests).

## Layout

`packages/app` and `packages/backend` are the dev shell. The product packages are
`kong-service-manager` (`frontend-plugin`), `kong-service-manager-backend`
(`backend-plugin`), `kong-service-manager-common` (`common-library`),
`scaffolder-backend-module-kong` (`backend-plugin-module` for the scaffolder), and
`scaffolder-field-extensions-kong` (`frontend-plugin`). The workspace currently
declares Backstage `1.52.0` in `backstage.json`.

Only the service-manager backend, service-manager frontend, and scaffolder field
extension have `export-dynamic` scripts and are included by `make build-dynamic`.
The common library and scaffolder backend module remain static packages. The
service-manager backend and frontend depend on the common package with
`workspace:^`; the dev shell depends on the product packages for local wiring.

The local configuration includes `examples/`, `dynamic-plugins.yaml`, and
`app-config.dynamic.yaml`. See
[workspace layout](../../CONTRIBUTING.md#workspace-layout) and
[CONTEXT.md](../../CONTEXT.md) for the dev shell/Product boundary.

## Architecture

The service-manager frontend, backend, and common package form one product family.
The separate scaffolder backend module contributes Kong actions, while the
scaffolder field extension contributes the instance picker used by the dev shell.
`packages/backend/src/permissionPolicy.ts` is dev-shell wiring for the local role
profiles; it is not product logic.

The backend contains the Kong Admin API client and the promotion path. The workspace
documents direct changes and chart-based promotion, including edit-in-code for
code-owned plugins; the backend declares Helm as a prerequisite for that path.
Plugin ownership and controller ownership are separate signals in the promotion
model, and the local PDRs record the invariants.

## How to test

Apply the [role matrix](../../CONTRIBUTING.md#which-proofs-apply-to-which-backstagerole):
this workspace has frontend plugins, a backend plugin, a scaffolder backend module,
and a common library. Proof 1 uses the dev shell, package tests, and the Playwright
suite; the suite includes the permissions test under
`plugins/kong-service-manager/e2e-tests`.

For proof 2, `yarn dev:dynamic` exports the three dynamic packages and prints the
exact `devportal-local` command. The dynamic configuration mounts the service-manager
entity tab/card and the scaffolder field extension.

The backend and scaffolder module role evidence is the backend health and scaffolder
action checks in the [role matrix](../../CONTRIBUTING.md#which-proofs-apply-to-which-backstagerole);
the common library is proven through its consumers. Proofs 3 and 4 use the official
runner and distribution boundaries linked from [the four proofs](../../CONTRIBUTING.md#the-four-proofs-and-the-official-test-flow).

## Pull requests and changesets

Follow [Pull requests](../../CONTRIBUTING.md#pull-requests). Workspace-only design
records live in [`DECISIONS.md`](DECISIONS.md); the moved two-write-path decision is
appended there with the existing record style.
