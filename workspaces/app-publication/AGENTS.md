## Commands

Run commands from `workspaces/app-publication/`.

- `yarn install` — install the workspace dependencies.
- `yarn start` — run the dev shell (`packages/backend`) with the app-publication module loaded.
- `yarn tsc:full`, `yarn test:all`, `yarn prettier:check`, `yarn lint:all`, `yarn build:all` — run the local gates. `build:all` needs the declarations that `tsc:full` emits, so run them in that order.
- `make build-dynamic` — build the gates and export the module as a dynamic plugin.
- `yarn dev:dynamic` — export the module into the `devportal-local` proof runner; follow the full command it prints.

## Layout

`plugins/scaffolder-backend-module-app-publication` contains the `backend-plugin-module` product package for the
`scaffolder` plugin. It registers two actions in the actions registry, which the portal's MCP server exposes as
tools: `get-app-status` (a read of the app's sheet, with no wait) and `wait-for-app-publication` (a bounded wait
that follows one pushed commit through its merge request, the merge, the default branch's pipeline and the deploy).
The role-sized harness is `packages/backend` plus unit tests. Product code stays under `plugins/`; the harness
contains only wiring and the example configuration in `app-config.yaml` and `dynamic-plugins.yaml`.

## Architecture

This workspace is generated from the repository workspace template's shape. The product package is private until
it is registered through the export overlay. Keep workspace-only decisions in `DECISIONS.md` and do not copy
cross-workspace rules into this file.

Both actions are read-only and idempotent. Each one checks that the caller is a user who owns the System, before any
GitLab request. GitLab is read with the portal's `integrations.gitlab` token. Result files written by a job
(`smoke-result.json` schema 2 and `contract-result.json`) are untrusted: every field is validated, and a value is
returned only when it fits a closed list or matches GitLab's own data. Every sentence the tools return is written for
Claude to relay to a person who has no access to GitLab or to the cluster.

## How to test

Use the [four proofs and official flow](../../CONTRIBUTING.md#the-four-proofs-and-the-official-test-flow).
For this `backend-plugin-module` (scaffolder), proof 1 is `yarn test:all`, with a fake `fetch` for GitLab, a fake
clock, and fake catalog, user-info and auth services. Proof 2 is the two actions listed in the portal's MCP tools in
devportal-local. Build in `devportal-plugins`, prove in `devportal-local`, then publish through `export-overlays`, in
that order: run proofs 1 and 2 before publishing, and state it in the overlay PR when you skip proof 2 on purpose.

## Pull requests and changesets

Follow [Pull requests](../../CONTRIBUTING.md#pull-requests). The product package is private and ships through the
export overlay, so this workspace adds no changeset until it is published. Record workspace-only decisions in
`DECISIONS.md`.
