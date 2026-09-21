<!-- Workspace context follows the repository standard in CONTRIBUTING.md. -->

## Commands

Run commands from `workspaces/ldap-auth/`.

- `yarn install`, `yarn start`, `yarn tsc:full`, `yarn build:all`, `yarn test:all`, `yarn test:e2e`, `yarn lint:all`, and `yarn prettier:check` are the workspace gates.
- Product package commands are available under `plugins/`.

## Layout

`packages/app` and `packages/backend` are the dev shell. The LDAP frontend
plugin and backend authentication module live under `plugins/`; app-config files
hold the external identity-provider contract.

## Architecture

The frontend package owns the sign-in experience and the backend module owns
provider wiring. The harness supplies the Backstage app and backend without
embedding provider credentials in the repository.

## How to test

Frontend proof uses the app and Playwright harness; backend-module proof uses the
backend harness and package tests. External LDAP connectivity is an environment
fixture, not a checked-in secret. Use the four proofs in
`../../CONTRIBUTING.md`.

## Pull requests and changesets

Follow `../../CONTRIBUTING.md`. Never commit identity-provider secrets; add
changesets for publishable product changes.
