<!-- Workspace context follows the repository standard in CONTRIBUTING.md. -->

## Commands

Run commands from `workspaces/marketplace/`.

- `yarn install`, `yarn start`, `yarn tsc:full`, `yarn build:all`, `yarn test:all`, `yarn test:e2e`, `yarn lint:all`, and `yarn prettier:check` are the workspace gates.
- `yarn dev:dynamic` exports the frontend, backend, and pending-changes artifacts for the `devportal-local` proof.
- `make build-dynamic` remains a convenience wrapper; it must not publish artifacts as part of a normal pull request.

## Layout

`packages/app` and `packages/backend` are the static dev harness. Product
packages under `plugins/` include the marketplace frontend, marketplace backend,
and pending-changes frontend plus their dynamic wrappers.

## Architecture

The marketplace frontend and pending-changes button consume the extensions API
served by the marketplace backend. The app harness mounts the marketplace route
and the pending-changes component; the dynamic configuration mirrors those
mounts for `devportal-local`. The backend artifact is exported from
`devportal-marketplace-backend` itself; there is no separate backend-dynamic
wrapper directory.

## How to test

Frontend proof uses the app and Playwright route smoke test; backend proof uses
the backend harness and package tests. Dynamic export is proof of the artifact
boundary; runtime loading is proven only by the `devportal-local` flow. Use the
four proofs in `../../CONTRIBUTING.md`.

## Pull requests and changesets

Follow `../../CONTRIBUTING.md`. Keep the shared `extensions` plugin-id contract
and the frontend/backend pairing explicit in review; add changesets for
publishable package changes.
