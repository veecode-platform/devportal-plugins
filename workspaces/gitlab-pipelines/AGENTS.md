<!-- This file follows the mandatory workspace template; see [CONTRIBUTING.md](../../CONTRIBUTING.md). -->

## Commands

Run commands from `workspaces/gitlab-pipelines/`.

- Workspace scripts: `yarn install`, `yarn start`, `yarn start:local`, `yarn tsc`, `yarn tsc:full`, `yarn build:all`, `yarn test:all --watchAll=false`, `yarn test:all --coverage`, `yarn test:e2e`, `yarn lint:all`, and `yarn prettier:check`.
- In `plugins/gitlab-pipelines` or `plugins/gitlab-pipelines-backend`: `yarn start`, `yarn build`, `yarn test --watchAll=false`, and `yarn lint`.
- In `plugins/gitlab-pipelines-common`: `yarn build`, `yarn test --watchAll=false`, and `yarn lint`.
- Makefile targets: `make help`, `make build`, `make build-dynamic`, `make pack`, `make pack-dynamic`, `make clean`, `make clean-dynamic`, `make replace-workspace`, and `make restore-workspace`.
- The Makefile also defines `make set-version VERSION=x.y.z`. npm publishing is retired; plugins now ship through the export overlay (OCI). The official delivery rules are in [Pull requests](../../CONTRIBUTING.md#pull-requests).

## Layout

`packages/app` and `packages/backend` are the dev shell. The product packages are
`gitlab-pipelines` (`frontend-plugin`), `gitlab-pipelines-backend`
(`backend-plugin`), and `gitlab-pipelines-common` (`common-library`). The workspace
currently declares Backstage `1.52.0` in `backstage.json`.

The frontend and backend export dynamically; the common package is embedded by the
backend export rather than exported as a separate dynamic package. The root
`dynamic-plugins.yaml` contains the proof-2 runner config; `examples/entities.yaml`
shows the entity annotations the plugins read. The Makefile's `replace-workspace` and
`restore-workspace` targets manage the `workspace:*` references used by the frontend
and backend.

## Architecture

The frontend is entity-anchored: the backend resolves the GitLab instance and
project from the catalog entity instead of accepting an arbitrary project from the
browser. Every operation checks credentials, the resource-scoped permission, and
ownership. The four permission names are defined by the backend for read, trigger,
play, and cancel operations.

The optional lifecycle reconciler records teardown operations and removes the catalog
descriptor only after the configured job and default-branch guards pass. Its delete
commit uses `[skip ci]`; the scaffolder and deploy-time checks provide the remaining
guards. The frontend renders the recorded teardown state in the entity's CI tab.

## How to test

Apply the [role matrix](../../CONTRIBUTING.md#which-proofs-apply-to-which-backstagerole):
this workspace has a `frontend-plugin`, a `backend-plugin`, and a `common-library`.
Proof 1 uses package unit tests and the dev shell; the common package is proven by
the frontend and backend consumers. The Playwright config starts the workspace with
`yarn start` when `PLAYWRIGHT_URL` is absent, or runs against an already-running
portal when `PLAYWRIGHT_URL` is set.

For proof 2, `yarn dev:dynamic` exports the frontend and backend and embeds the
private common package, then prints the exact `devportal-local` command. The dynamic
smoke proves loading; real GitLab data and actions require configured integration
inputs.

The backend role evidence is the entity-anchored health and permission behavior; the
frontend evidence is the configured entity cards. The common library has no separate
proof-2 artifact. Proofs 3 and 4 use the boundaries in [the four proofs](../../CONTRIBUTING.md#the-four-proofs-and-the-official-test-flow).

## Pull requests and changesets

Follow [Pull requests](../../CONTRIBUTING.md#pull-requests). Preserve the existing
`workspace:*` development references and use the workspace Makefile's replacement
and restoration targets only where its packaging workflow requires them.
