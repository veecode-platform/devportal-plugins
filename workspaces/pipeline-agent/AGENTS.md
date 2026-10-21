<!-- This file follows the mandatory workspace template; see [CONTRIBUTING.md](../../CONTRIBUTING.md). -->

## Commands

Run commands from `workspaces/pipeline-agent/`.

- Workspace scripts: `yarn install`, `yarn start`, `yarn start:local`, `yarn tsc`, `yarn tsc:full`, `yarn build:all`, `yarn test:all --watchAll=false`, `yarn test:all --coverage`, `yarn test:e2e`, `yarn lint:all`, and `yarn prettier:check`.
- In `plugins/pipeline-agent`, `plugins/pipeline-agent-backend`, or `plugins/pipeline-agent-common`: `yarn build`, `yarn test --watchAll=false`, and `yarn lint`.
- `yarn dev:dynamic` exports the frontend and backend products and prints the `devportal-local` command that runs them (proof 2).
- Makefile targets: `make help`, `make build`, `make build-dynamic`, `make pack`, `make pack-dynamic`, `make clean`, `make clean-dynamic`, `make replace-workspace`, and `make restore-workspace`.
- The Makefile also defines `make set-version VERSION=x.y.z`. npm publishing is retired; plugins ship through the export overlay (OCI). The official delivery rules are in [Pull requests](../../CONTRIBUTING.md#pull-requests).

## Layout

`packages/app` and `packages/backend` are the dev shell. The product packages are
`pipeline-agent` (`frontend-plugin`), `pipeline-agent-backend` (`backend-plugin`), and
`pipeline-agent-common` (`common-library`). The workspace declares Backstage `1.52.0`
in `backstage.json`, the host version.

The frontend and backend export dynamically; the common package is embedded by the
backend export rather than exported as a separate dynamic package. The root
`dynamic-plugins.yaml` contains the proof-2 runner config; `examples/entities.yaml`
holds the entity that carries the `gitlab.com/project-slug` annotation. The
Makefile's `replace-workspace` and `restore-workspace` targets manage the
`workspace:*` reference to the common package.

## Architecture

The HTTP contract lives in `plugins/pipeline-agent-common/src/contract.ts`, with the
wire types in `types.ts`. Frontend and backend import the same route constants and
bodies. The contract mirrors the prototype's routes and bodies (PDR-002).

The backend holds the Anthropic API key and the GitLab write token; the browser never
receives either (PDR-001). The frontend never calls Anthropic or GitLab. Every call
that starts or lists work names a catalog entity, and the backend resolves the GitLab
project from that entity's annotation; the browser never sends a project.

Only the health route and the placeholder card are implemented. The other routes return
`501` until their handlers land.

## How to test

Apply the [role matrix](../../CONTRIBUTING.md#which-proofs-apply-to-which-backstagerole):
the frontend is a `frontend-plugin` (proof 1: unit tests and the Playwright card check
against the dev shell), the backend is a `backend-plugin` (proof 2: `/api/pipeline-agent/health`
answers in `devportal-local`), and the common package is a `common-library` (unit tests
only; its consumers prove it).

The Playwright config starts the workspace with `yarn start` when `PLAYWRIGHT_URL` is
absent, or runs against an already-running portal when `PLAYWRIGHT_URL` is set.

Proofs 3 and 4 use the boundaries in [the four proofs](../../CONTRIBUTING.md#the-four-proofs-and-the-official-test-flow).

## Pull requests and changesets

Follow [Pull requests](../../CONTRIBUTING.md#pull-requests). Add a changeset when a
product package changes and record workspace-only decisions in `DECISIONS.md`.
