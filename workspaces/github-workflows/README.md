# GitHub Workflows Workspace

This workspace contains:

- Backend plugin: `plugins/github-workflow-backend`
- Frontend plugin: `plugins/github-workflows`
- Common library: `plugins/github-workflows-common`
- Hosting app: `packages/app` and `packages/backend`

Agent context is in [AGENTS.md](AGENTS.md). Consumer documentation for the frontend plugin, including the [v2 migration guide](plugins/github-workflows/MIGRATION.md), lives in [`plugins/github-workflows/`](plugins/github-workflows/).

## Development

To start the hosting app while developing the plugins:

```sh
yarn install
yarn start
```

Both plugins ship mock implementations, so the hosting app runs without GitHub credentials.

## Publish

```sh
make set-version VERSION=x.y.z
make publish            # static packages (common first, then frontend and backend)
make publish-dynamic    # dynamic packages, from dist-dynamic/
```

Both publish targets first run `replace-workspace`, which rewrites the `workspace:*` reference to `@veecode-platform/github-workflows-common` into `^VERSION`. Run `make restore-workspace` afterwards to get the workspace reference back. `make help` lists every target.

## Dynamic testing

See [`dynamic/README.md`](dynamic/README.md). `dynamic/run-dynamic.sh` starts a DevPortal container that mounts the plugins' `dist-dynamic/` folders; build them first with `make build-dynamic`.
