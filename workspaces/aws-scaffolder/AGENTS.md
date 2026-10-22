## Commands

Run commands from `workspaces/aws-scaffolder/`.

- `yarn install` — install the workspace dependencies.
- `yarn start` — run the dev shell (`packages/backend`) with the scaffolder action loaded.
- `yarn tsc:full`, `yarn test:all`, `yarn prettier:check`, `yarn lint:all`, `yarn build:all` — run the local gates.
- `make build-dynamic` — build the gates and export the module as a dynamic plugin into
  `plugins/scaffolder-backend-module-aws-lambda/dist-dynamic`.
- `yarn dev:dynamic` — export the module into the `devportal-local` proof runner; follow the
  complete Compose command it prints.
- After it is running, `curl` `/api/scaffolder/v2/actions` and check that `aws:lambda:invoke` is listed.

## Layout

`plugins/scaffolder-backend-module-aws-lambda` contains the `backend-plugin-module` product
package for the `scaffolder` plugin. The role-sized harness is `packages/backend` plus unit
tests. Product code stays under `plugins/`; the harness contains only wiring and the example
configuration in `app-config.yaml` and `dynamic-plugins.yaml`.

## Architecture

This workspace is generated from the repository workspace template, with the product package
added through `backstage-cli new`. The product package is private until it is registered through
the export overlay. Keep workspace-only decisions in `DECISIONS.md` and do not copy
cross-workspace rules into this file.

## How to test

Use the [four proofs and official flow](../../CONTRIBUTING.md#the-four-proofs-and-the-official-test-flow).
For this `backend-plugin-module` (scaffolder), proof 1 is `yarn test:all`, with mocked STS and
Lambda clients; proof 2 is the action `aws:lambda:invoke` listed in `/api/scaffolder/v2/actions`
in devportal-local.
Build in `devportal-plugins`, prove in `devportal-local`, then publish through
`export-overlays`, in that order: run proofs 1 and 2 before publishing, and state it in
the overlay PR when you skip proof 2 on purpose. No publication is needed for proof 2.

## Pull requests and changesets

Follow [Pull requests](../../CONTRIBUTING.md#pull-requests). Add a changeset when
the product package changes and record workspace-only decisions in `DECISIONS.md`.
