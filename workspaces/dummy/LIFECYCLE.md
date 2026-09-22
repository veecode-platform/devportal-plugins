# dummy workspace lifecycle

`dummy` is the preserved reference fixture (plugins ADR-0003, ADR-0012): a frontend plugin
(`plugins/dummy`) and a backend plugin (`plugins/dummy-backend`) with the dev shell under
`packages/`. It is never published. New workspaces come from `yarn create-workspace`, not from
copying this one.

1. **Develop** under `plugins/`. `yarn start` runs the dev shell with hot reload.
2. **Proof 1** — `yarn tsc:full`, `yarn lint:all`, `yarn test:all`, `yarn prettier:check`, and
   `yarn test:e2e` for the frontend (set `PLAYWRIGHT_URL` to target a running portal).
3. **Proof 2** — `yarn dev:dynamic` exports both plugins into the `devportal-local` runner and
   prints the Compose command to run there. Proof 2 needs no publication.
4. **Publish** — for a real workspace, the `devportal-publish` skill opens the overlay pull
   request; `/publish` as a PR comment builds the `pr_<n>__<version>` candidate and the overlay
   smoke test is proof 3. A changeset records the version intent (plugins ADR-0011).

The proofs and the official flow are defined once, in
[`CONTEXT.md`](../../CONTEXT.md#proving-a-plugin) and [`CONTRIBUTING.md`](../../CONTRIBUTING.md).

## Makefile targets

| Target                              | What it does                                                        |
| ----------------------------------- | ------------------------------------------------------------------- |
| `make build`                        | Builds the static packages                                          |
| `make build-dynamic`                | Builds, then exports both plugins with `@red-hat-developer-hub/cli` |
| `make pack` / `make pack-dynamic`   | Packs static / dynamic artifacts locally                            |
| `make set-version VERSION=x.y.z`    | Sets the version of every plugin package                            |
| `make clean` / `make clean-dynamic` | Removes build / export output                                       |

The npm-facing targets still in the Makefile (`get-version`, `unpublish`) predate plugins
ADR-0010 and do not apply: nothing is published to npm.

`docker-compose.yaml` in this workspace is a transitional harness kept until the per-workspace
composes are retired; proof 2 runs in `devportal-local`.
