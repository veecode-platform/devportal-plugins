<!-- Workspace context follows the repository standard in CONTRIBUTING.md. -->

## Commands

Run commands from `workspaces/github-workflows/`.

- Use `yarn install`, `yarn start`, `yarn tsc:full`, `yarn build:all`, `yarn test:all`, `yarn test:e2e`, `yarn lint:all`, and `yarn prettier:check` for the workspace gates.
- The Makefile retains legacy build and publication helpers; follow `../../CONTRIBUTING.md` for delivery.

## Layout

`packages/app` and `packages/backend` are the local harness. Product packages
live under `plugins/`: frontend, backend, and common-library roles. The `dynamic/`
directory contains the transitional runtime smoke configuration.

## Architecture

The frontend and backend packages are the product pair and the common package is
their shared contract. Runtime configuration is kept in `dynamic/`; it is not
product implementation.

## How to test

Frontend proof uses the app and Playwright harness; backend proof uses the
backend harness and package tests; the common library is proven through its
consumers. `CLAUDE.md` is historical context; this file is the repository agent
entry point. Use the four proofs in `../../CONTRIBUTING.md`.

## Pull requests and changesets

Follow `../../CONTRIBUTING.md`. Preserve the existing migration notes and add
changesets for publishable product changes.
