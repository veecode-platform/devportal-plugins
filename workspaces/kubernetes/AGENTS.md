<!-- Workspace context follows the repository standard in CONTRIBUTING.md. -->

## Commands

Run commands from `workspaces/kubernetes/`.

- `yarn install`, `yarn start`, `yarn tsc:full`, `yarn build:all`, `yarn test:all`, `yarn test:e2e`, `yarn lint:all`, and `yarn prettier:check` are the workspace gates.
- Product package commands are available under `plugins/`.

## Layout

`packages/app` and `packages/backend` are the dev shell. The Kubernetes catalog
backend module is under `plugins/`; root app configuration contains the local
cluster fixture contract.

## Architecture

The product is a `backend-plugin-module` registered by the backend harness. The
frontend app is a shell fixture for proving the backend module in a normal
Backstage workspace; it is not a second product package.

## How to test

Backend-module proof uses the backend harness, package tests, and the configured
Kubernetes fixture. The app and Playwright harness cover shell startup where
needed. Use the four proofs and official flow in `../../CONTRIBUTING.md`.

## Pull requests and changesets

Follow `../../CONTRIBUTING.md`. Keep cluster-fixture changes explicit and add
changesets for publishable product changes.
