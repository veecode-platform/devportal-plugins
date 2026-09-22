<!-- This file follows the mandatory workspace template; see [CONTRIBUTING.md](../../CONTRIBUTING.md). -->

## Commands

Run commands from `workspaces/dummy/`.

- Workspace scripts: `yarn install`, `yarn start`, `yarn tsc`, `yarn tsc:full`, `yarn build:all`, `yarn test:all --watchAll=false`, `yarn test:all --coverage`, `yarn test:e2e`, `yarn lint:all`, and `yarn prettier:check`.
- In `plugins/dummy` or `plugins/dummy-backend`: `yarn start`, `yarn build`, `yarn test --watchAll=false`, and `yarn lint`.
- Makefile targets: `make help`, `make build`, `make build-dynamic`, `make pack`, `make pack-dynamic`, `make clean`, and `make clean-dynamic`.
- The Makefile also defines `make set-version VERSION=x.y.z`. npm publishing is retired; plugins now ship through the export overlay (OCI). The official delivery rules are in [Pull requests](../../CONTRIBUTING.md#pull-requests).

## Layout

`packages/app` and `packages/backend` are the dev shell. `plugins/dummy` is the
`frontend-plugin` package and `plugins/dummy-backend` is the `backend-plugin`
package; both have dynamic export scripts and `dist-dynamic` output. The workspace
root is private, and both plugin packages are `private: true`. `backstage.json`
currently declares Backstage `1.52.0`.

The local configuration consists of `app-config.yaml`, the dynamic configuration,
the example catalog/template data, and the transitional `docker-compose.yaml`.
The dev shell is not a product package; see [workspace layout](../../CONTRIBUTING.md#workspace-layout)
and [CONTEXT.md](../../CONTEXT.md).

## Architecture

The frontend plugin demonstrates a full page, an entity card and entity tab, and
data fetched from the backend. The backend plugin exposes the `/teams` example
endpoint through a service and dependency injection. The dev shell wires the pair
into the catalog/entity page and backend.

The dynamic configuration exposes the frontend route and entity mount points, while
the backend and frontend packages export independently. The package metadata uses
`pluginId` `dummy` for the frontend and `plugin-dummy-backend` for the backend.

## How to test

Apply the [role matrix](../../CONTRIBUTING.md#which-proofs-apply-to-which-backstagerole):
this workspace has a `frontend-plugin` and a `backend-plugin`, so its harness covers
the frontend route and the backend health evidence as well as package tests.

Proof 1 is organized in three layers: frontend and backend package tests under
`plugins/`, dev-shell wiring tests under the `packages/app` and `packages/backend`
source trees, and the Playwright suite selected by `playwright.config.ts`. The
reference test files are `plugins/dummy/src/plugin.test.ts`, component tests under
`DummyComponent`, `DummyFetchComponent`, `DummyCard`, and `DummyContent`, backend
`plugin.test.ts` and `router.test.ts`, plus `App.test.tsx` and `index.test.ts` in the
two dev-shell packages.
The frontend tests cover plugin export, components, entity rendering, and mocked
fetch; the backend tests cover the real backend feature and a router with a mocked
service. The Playwright configuration starts the app and backend through the
workspace `start` script when not running in CI and accepts `PLAYWRIGHT_URL`.

For proof 2, `make build-dynamic` exports both plugin packages. The current compose
file is transitional and defaults to the digest-pinned `veecode/devportal` image,
overridable with `DEVPORTAL_IMAGE`. The installer receives each export at
`/opt/app-root/src/dynamic-plugins/dist/<pkg>`, copies it into the named
`dynamic-plugins-root` volume, and the portal reads that volume at
`/opt/app-root/src/dynamic-plugins-root`.

Proofs 3 and 4 use the role evidence and flow linked from
[the four proofs](../../CONTRIBUTING.md#the-four-proofs-and-the-official-test-flow);
this workspace owns neither the overlay recipe nor the local runner.

## Pull requests and changesets

Follow [Pull requests](../../CONTRIBUTING.md#pull-requests). Dummy has no local
`DECISIONS.md`; workspace-specific decisions should be added only when they need a
durable record.
