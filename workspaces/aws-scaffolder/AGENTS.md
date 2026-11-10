## Commands

Run commands from `workspaces/aws-scaffolder/`.

- `yarn install` — install the workspace dependencies.
- `yarn start` — run the dev shell (`packages/backend`) with the app-secrets module loaded.
- `yarn tsc:full`, `yarn test:all`, `yarn prettier:check`, `yarn lint:all`, `yarn build:all` — run the local gates. `build:all` needs the declarations that `tsc:full` emits, so run them in that order.
- `make build-dynamic` — build the gates and export the module as a dynamic plugin into
  `plugins/scaffolder-backend-module-aws-app-secrets/dist-dynamic`.
- `yarn dev:dynamic` — export the module into the `devportal-local` proof runner; follow the
  complete Compose command it prints.

## Layout

`plugins/scaffolder-backend-module-aws-app-secrets` contains the `backend-plugin-module` product
package for the `scaffolder` plugin. It registers three actions: the scaffolder actions
`aws:secrets-manager:app-secret:register` and `aws:cognito:app-login-client:ensure`, and the
actions-registry action `list-app-secrets`. The register and list actions run the same ownership and
declaration checks; the login client action runs the ownership check only. The role-sized harness is `packages/backend`
plus unit tests. Product code stays under `plugins/`; the harness contains only wiring and the
example configuration in `app-config.yaml` and `dynamic-plugins.yaml`.

## Architecture

This workspace is generated from the repository workspace template. The product package is private
until it is registered through the export overlay. Keep workspace-only decisions in `DECISIONS.md`
and do not copy cross-workspace rules into this file.

The module never reads a secret value. The register action takes the value from the task secrets,
the list action reads Secrets Manager metadata only, and the login client action creates secrets
and never puts a new version on one that exists. Every AWS call goes through the writer
role, with a session name and source identity that name the task or the user.

## How to test

Use the [four proofs and official flow](../../CONTRIBUTING.md#the-four-proofs-and-the-official-test-flow).
For this `backend-plugin-module` (scaffolder), proof 1 is `yarn test:all`, with mocked STS and
Secrets Manager and Cognito clients and fake catalog, user-info and URL-reader services. Proof 2 is
the actions `aws:secrets-manager:app-secret:register` and `aws:cognito:app-login-client:ensure`
listed in `/api/scaffolder/v2/actions` in devportal-local.
Build in `devportal-plugins`, prove in `devportal-local`, then publish through `export-overlays`,
in that order: run proofs 1 and 2 before publishing, and state it in the overlay PR when you skip
proof 2 on purpose. No publication is needed for proof 2.

## Pull requests and changesets

Follow [Pull requests](../../CONTRIBUTING.md#pull-requests). The product package is private and
ships through the export overlay, so this workspace adds no changeset until it is published.
Record workspace-only decisions in `DECISIONS.md`.
