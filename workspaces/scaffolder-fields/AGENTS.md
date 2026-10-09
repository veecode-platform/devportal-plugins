<!-- This file follows the mandatory workspace template; see [CONTRIBUTING.md](../../CONTRIBUTING.md). -->

## Commands

Run commands from `workspaces/scaffolder-fields/`.

- `yarn install` — install the workspace dependencies.
- `yarn start` — run the dev shell (`packages/app`) on `http://localhost:3000`.
- `yarn tsc:full`, `yarn build:all`, `yarn test:all --watchAll=false`, `yarn lint:all`, `yarn prettier:check` — the local gates.
- `yarn test:e2e` — run the Playwright suite against the dev shell. Set `PLAYWRIGHT_URL` when a portal is already running (for example, in `devportal-local`).
- In `plugins/scaffolder-field-catalog-prefill`: `yarn test --watchAll=false`, `yarn lint`, `yarn export-dynamic`.
- `yarn dev:dynamic` — export the product and its dynamic-plugin configuration into the `devportal-local` proof runner; follow the complete Compose command it prints.
- Makefile targets: `make build`, `make build-dynamic`, `make clean`.

## Layout

`plugins/scaffolder-field-catalog-prefill` is the only product package (`frontend-plugin`). The workspace is the home for generic scaffolder field extensions; add a package under `plugins/` for each new one. `packages/app` is the dev shell: it has no backend, so `packages/app/src/apis.ts` answers `catalogApiRef` and `scaffolderApiRef` from the fixtures in `examples/` (three `Resource` entities of type `skill`, and the `manage-skill` template). The workspace declares Backstage `1.52.0` in `backstage.json`.

## Architecture

`CatalogEntityPrefill` is a `ui:field` for the root object of a template step. It renders the step through RJSF's own `ObjectField` and fills form properties from a catalog entity, so the template's parameters stay flat strings. The decisions behind it are in [`DECISIONS.md`](DECISIONS.md); the options and an example template are in the [package README](plugins/scaffolder-field-catalog-prefill/README.md).

`createAsyncValidators` in `@backstage/plugin-scaffolder-react` never visits the root object of a step, so the field registers no `validation` hook and holds the step with an invalid hidden input instead (see PDR-004). `CatalogEntityPrefill.stepper.test.tsx` runs the real `Stepper` to prove the step stays put while the entity loads.

## How to test

Apply the [role matrix](../../CONTRIBUTING.md#which-proofs-apply-to-which-backstagerole): for a scaffolder field extension, proof 1 is the Jest tests plus the Playwright suite against the example template, and the minimum proof 2 is that the template form renders the field in `devportal-local`.

The Playwright configuration follows the upstream `PLAYWRIGHT_URL` convention: without it, the workspace starts the dev shell; with it, no server is started and the tests target the supplied portal URL. The suite expects the `manage-skill` template and the three fixture entities, which `dynamic-plugins.yaml` registers in the runner from `examples/`. Its `scaffolderRequests` assertion reads a dev-shell hook, so it only runs against the dev shell.

Build in `devportal-plugins`, prove in `devportal-local`, then publish through `export-overlays`, in that order, as in [the four proofs](../../CONTRIBUTING.md#the-four-proofs-and-the-official-test-flow).

## Pull requests and changesets

Follow [Pull requests](../../CONTRIBUTING.md#pull-requests). Add a changeset when the product package changes and record workspace-only decisions in `DECISIONS.md`. The package is `private` until it is registered through the export overlay, and `scripts/ci/verify-changesets.js` rejects a changeset that names a private package; drop `private` in the registration pull request.
