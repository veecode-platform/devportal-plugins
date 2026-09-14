# Plugin Lifecycle Guide

Develop, test and release a plugin pair (frontend + backend), using the `dummy` workspace as
the concrete example. Every command below exists in this workspace's `Makefile` or
`package.json`. Other workspaces follow the same Makefile shape; `make help` lists their
targets.

## Artifacts

```pre
plugins/<plugin>/                → frontend plugin source
plugins/<plugin>-backend/        → backend plugin source

plugins/<plugin>/dist/           → static build (backstage-cli package build)
plugins/<plugin>/dist-dynamic/   → dynamic export (@red-hat-developer-hub/cli plugin export)
plugins/<plugin>-backend/dist/
plugins/<plugin>-backend/dist-dynamic/
```

`dist-dynamic/` is derived from `dist/` and never edited. The static package is published from
the plugin directory; the dynamic package is published from inside `dist-dynamic/`.

## 1. Local development

### Static mode (hot reload)

```sh
yarn install
yarn start
```

Starts the hosting app with both plugins loaded statically. Changes under `src/` are
reflected immediately. A single plugin can also run on its own: `yarn start` inside
`plugins/dummy/` (uses `dev/index.tsx`) or `plugins/dummy-backend/` (uses `dev/index.ts`,
with mocked auth).

### Dynamic mode (container)

```sh
make build-dynamic
docker compose up
```

Builds `dist-dynamic/` for both plugins and mounts them into the DevPortal container (see
`docker-compose.yaml`). No npm publish required.

> **No hot reload in dynamic mode.** `dynamic-plugins.yaml` and `app-config.dynamic.yaml`
> are read once at container boot. Code changes need `make build-dynamic` and
> `docker compose restart`; config-only changes need only the restart.

## 2. Making a code change

1. Edit source under `plugins/dummy/src/` or `plugins/dummy-backend/src/`.
2. Check and test: `yarn tsc`, `yarn test:all`, `yarn lint:all`. From a plugin directory,
   `yarn test --watchAll=false`.
3. Run it statically: `yarn start`.
4. Prove the dynamic artifact: `make build-dynamic`, `docker compose up`, verify at
   `http://localhost:7007`, `docker compose down`.

## 3. Release

Dummy's packages are `private: true`, so npm refuses to publish them. The steps below are what
the same targets do in a workspace whose packages are public.

### 3.1 Set the version

```sh
make set-version VERSION=0.2.0
```

Rewrites `version` in every plugin `package.json`, then runs `yarn install`. The Makefile's own
`VERSION` variable (default at the top of the file) is what `publish`, `unpublish` and
`get-version` use, so pass the same `VERSION=` on those calls or change the default.

### 3.2 Build

```sh
make build           # yarn install && yarn tsc && yarn build:all
make build-dynamic   # make build, then export each plugin to dist-dynamic/
```

`build-dynamic` first removes module-federation leftovers from the frontend `dist/`, then runs
`@red-hat-developer-hub/cli plugin export` in each plugin.

### 3.3 Publish

```sh
make publish            # static packages, from plugins/*/ ; skips versions already published
make publish-dynamic    # dynamic packages, from plugins/*/dist-dynamic/
```

To publish to a private registry (for example a local Verdaccio):

```sh
make publish NPM_REGISTRY=http://localhost:4873
make publish-dynamic NPM_REGISTRY=http://localhost:4873
```

### 3.4 Verify, pack or undo

```sh
make get-version    # latest version of each package in the registry
make pack           # .tgz of each static package
make pack-dynamic   # .tgz of each dynamic package
make unpublish      # remove the current VERSION of every package from the registry
```

## 4. Quick reference

| Goal | Command |
|------|---------|
| Start dev (static, hot reload) | `yarn start` |
| Type check, tests, lint | `yarn tsc`, `yarn test:all`, `yarn lint:all` |
| Build static packages | `make build` |
| Build dynamic artifacts | `make build-dynamic` |
| Start / restart / stop the container | `docker compose up` / `restart` / `down` |
| Set version | `make set-version VERSION=x.y.z` |
| Publish static / dynamic | `make publish` / `make publish-dynamic` |
| Check published versions | `make get-version` |
| Remove dynamic artifacts | `make clean-dynamic` |
| Remove everything built, including `node_modules` | `make clean` |

## 5. Package naming convention

Static packages published from this repository follow:

| Role | npm package name |
|------|------------------|
| Frontend | `@veecode-platform/backstage-plugin-<plugin>` |
| Backend | `@veecode-platform/backstage-plugin-<plugin>-backend` |
| Common library | `@veecode-platform/backstage-plugin-<plugin>-common` |

The dynamic export keeps the name with a `-dynamic` suffix; the folder the container expects
under `/app/dynamic-plugins/dist/` is the scope-less form used in `docker-compose.yaml`
(`veecode-platform-backstage-plugin-<plugin>-dynamic`). Older packages use the shorter
`@veecode-platform/plugin-<name>` form; new packages use the `backstage-plugin-` form. The
full table of patterns in use is in the planning repository (`docs/inventory/plugins.md`).
