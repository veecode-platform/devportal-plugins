<!-- Workspace context follows the repository standard in CONTRIBUTING.md. -->

## Commands

Run commands from `workspaces/aws-s3-catalog/`.

- `yarn install`, `yarn tsc:full`, `yarn build:all`, `yarn test:all`, `yarn lint:all`, and `yarn prettier:check` are the workspace gates.
- `yarn workspace backend build` builds the role-sized backend harness.
- `yarn dev:dynamic` exports the AWS S3 catalog module for the `devportal-local` proof.

## Layout

`plugins/aws-s3-catalog-module` is the `backend-plugin-module` product. The
catalog backend harness lives in `packages/backend`; root configuration stays
separate from the product package.

## Architecture

The product is a thin wrapper around Backstage's AWS S3 catalog module. The
harness wires it into a minimal catalog backend for development. The YAML under
`fixtures/` is a local catalog input selected by `catalog.locations`; it does
not call AWS or prove remote S3 discovery.

## How to test

The backend-module role is covered by the backend harness, package gates, and
the dynamic export. The local fixture only covers catalog file wiring; it does
not prove AWS access or remote ingestion. Use the four proofs and official flow
in `../../CONTRIBUTING.md`; do not treat an export as runtime proof by itself.

## Pull requests and changesets

Follow `../../CONTRIBUTING.md`. Keep upstream-wrapper decisions in the product
package context and add a changeset for publishable changes.
