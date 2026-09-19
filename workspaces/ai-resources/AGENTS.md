<!-- Workspace context follows the repository standard in CONTRIBUTING.md. -->

## Commands

Run commands from `workspaces/ai-resources/`.

- `yarn install`, `yarn tsc:full`, `yarn build:all`, `yarn test:all`, `yarn lint:all`, and `yarn prettier:check` are the workspace gates.
- `yarn workspace backend build` builds the role-sized backend harness.
- `yarn dev:dynamic` exports the product package for the `devportal-local` proof.

## Layout

`plugins/catalog-backend-module-ai-resources` is the `backend-plugin-module`
product. `packages/backend` is its host harness and registers the module with a
minimal Backstage catalog backend.

## Architecture

The product is registration-only: it adds the AI resource and MCP server catalog
models supplied by Backstage. The harness owns backend composition and local
configuration; it does not duplicate product logic. The YAML under `fixtures/`
is a local catalog input selected by `catalog.locations`; it is not a remote
ingestion proof.

## How to test

The backend-module role is covered by the backend harness, the product package
tests, `yarn tsc:full`, and the dynamic export. The catalog rule in
`app-config.yaml` permits `AiResource` for the local proof. Use the four proofs
and official flow in `../../CONTRIBUTING.md`.

## Pull requests and changesets

Follow `../../CONTRIBUTING.md`. Keep model-registration decisions with the
product package and add a changeset for publishable product changes.
