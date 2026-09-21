<!-- Workspace context follows the repository standard in CONTRIBUTING.md. -->

## Commands

Run commands from `workspaces/aws-cost-insights/`.

- `yarn install`, `yarn start`, `yarn tsc:full`, `yarn build:all`, `yarn test:all`, `yarn test:e2e`, `yarn lint:all`, and `yarn prettier:check` are the workspace gates.
- Product packages have package-level `start`, `build`, `test`, and `lint` scripts where applicable.

## Layout

`packages/app` and `packages/backend` are the dev shell. The workspace contains
the AWS Cost Insights frontend/backend pair plus common libraries under
`plugins/`; configuration files at the root select the local AWS fixtures.

## Architecture

The frontend and backend packages form the product boundary. Common packages
contain shared types or clients and are proven through their consumers. Harness
code remains in `packages/`, not in product packages.

## How to test

The frontend role uses the app harness and Playwright smoke test; the backend
role uses the backend harness and backend/package tests; common libraries are
covered through consumers. Use the four proofs and official flow in
`../../CONTRIBUTING.md`.

## Pull requests and changesets

Follow `../../CONTRIBUTING.md`. Add changesets for publishable product packages
and keep workspace-specific decisions documented with the workspace.
