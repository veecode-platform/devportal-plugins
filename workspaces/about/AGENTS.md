# AGENTS.md — about workspace

Agent context for this workspace. Repository-wide rules, including the shape this file follows, are in the root [`AGENTS.md`](../../AGENTS.md).

## What the plugins do

The DevPortal "About" page: a frontend page that shows what the running instance is (operating system, memory and load, Node.js, Backstage and DevPortal versions) plus a Support tab, and the backend endpoint that collects those facts.

- `plugins/about` — `@veecode-platform/backstage-plugin-about`, frontend, `id: 'about'`. Public exports (`src/index.ts`): `aboutPlugin`, `AboutPage` (routable extension on `rootRouteRef`) and `AboutIcon` (re-export of `@mui/icons-material/InfoOutlined`). `AboutPage` renders the router outlet when a child route is mounted and otherwise `DefaultAboutPage`: a `TabbedLayout` with an Info tab (`AboutTab`, path `/`) and a Support tab (`SupportTab`, path `/support`, static links to e-mail, Discord, docs, website and AWS Marketplace).
- `plugins/about-backend` — `@veecode-platform/backstage-plugin-about-backend`, backend, `pluginId: 'about'`. One endpoint, `GET /info`, reachable at `/api/about/info`. `AboutBackendApi.listInfo()` reads the `os` module and `process.version`, then `backstage.json` and `devportal.json` from the target root returned by `findPaths(__dirname).resolveTargetRoot` (`@backstage/cli-common`); a missing file yields `'N/A'`.

Both packages are published (`publishConfig.access: public`) and carry an `export-dynamic` script (`rhdh-cli plugin export`). The hosting app (`packages/app`, `packages/backend`) exists to run and test them.

## Layout

```pre
workspaces/about/
├── packages/
│   ├── app/                      # Frontend hosting app; App.tsx mounts AboutPage at /about
│   │   └── src/App.test.tsx      # Only hosting-app test
│   └── backend/                  # Backend hosting app; index.ts adds the about backend
├── plugins/
│   ├── about/
│   │   ├── src/plugin.ts         # createPlugin + AboutPage; registers aboutApiRef -> AboutClient
│   │   ├── src/routes.ts         # rootRouteRef (id 'about')
│   │   ├── src/api/              # AboutApi interface, aboutApiRef, AboutClient
│   │   ├── src/hooks/            # useInfo (backend call), useSpec (GitHub call)
│   │   ├── src/components/       # AboutPage, DefaultAboutPage (AboutTab, SupportTab, icons)
│   │   └── dev/index.tsx         # Standalone dev app with a mocked AboutApi
│   └── about-backend/
│       ├── src/plugin.ts         # createBackendPlugin({ pluginId: 'about' })
│       ├── src/service/router.ts # GET /info
│       ├── src/api/AboutApi.ts   # AboutBackendApi.listInfo()
│       ├── src/utils/types.ts    # DevPortalInfo (duplicated in plugins/about/src/types.ts)
│       └── dev/index.ts          # Standalone backend with mocked auth
├── docker-compose.yaml           # Container harness (veecode/devportal:latest)
├── dynamic-plugins.yaml          # Enables both plugins; frontend route, icon, menu item
├── app-config.yaml               # Local dev config: guest auth, in-memory SQLite
├── backstage.json                # Backstage release (1.49.2)
├── Makefile
├── AGENTS.md                     # This file
└── CLAUDE.md                     # Thin pointer here
```

There is no workspace-level `README.md`, `DECISIONS.md`, `catalog-info.yaml`, `app-config.dynamic.yaml`, Playwright config or `config.d.ts` in this workspace.

## Commands

Run from `workspaces/about/`. The standard `yarn` and `make` targets from the root `AGENTS.md` all exist here; `yarn test:e2e` does not.

| Command | Purpose |
|---------|---------|
| `yarn start` | Hosting app with both plugins loaded statically |
| `yarn tsc` / `yarn tsc:full` | Type check (`tsc:full` disables `skipLibCheck` and incremental mode) |
| `yarn test:all` | All Jest suites with coverage |
| `yarn lint` / `yarn lint:all` | Lint since `origin/main` / everything |
| `yarn update-backstage` | `backstage-cli versions:bump` (see Gotchas before using it) |
| `make build` | `yarn install && yarn tsc && yarn build:all` |
| `make build-dynamic` | `make build`, then `npx @red-hat-developer-hub/cli@latest plugin export` in each plugin |
| `make publish` / `make publish-dynamic` | Publish `plugins/*` / `plugins/*/dist-dynamic` to npm |
| `docker compose up` / `down` | Load the exported plugins on a DevPortal container |

From a plugin directory: `yarn start`, `yarn test --watchAll=false`, `yarn build`, `yarn lint`, `yarn export-dynamic`.

## Architecture

- **Frontend API layer.** `aboutPlugin` registers `aboutApiRef` (`id: 'plugin.about.service'`) through `createApiFactory` with `discoveryApiRef` and `identityApiRef`, producing an `AboutClient`. `AboutClient.getInfo()` calls `discoveryApi.getBaseUrl('about')` + `/info` with the global `fetch`, sends `Authorization: Bearer <token>` from `identityApi.getCredentials()`, and throws `ResponseError.fromResponse` on a non-OK response. `useInfo` wraps it in `react-use`'s `useAsync`.
- **Backend.** `createBackendPlugin({ pluginId: 'about' })` depends only on `coreServices.httpRouter`. `createRouter()` takes no arguments, instantiates `AboutBackendApi` itself and serves `GET /info`. `src/index.ts` exports the plugin as default (`backend.add(import('@veecode-platform/backstage-plugin-about-backend'))`) plus `AboutBackendApi`, `createRouter`, `RouterOptions` and `DevPortalInfo`.
- **Static.** `packages/app/src/App.tsx` mounts `<Route path="/about" element={<AboutPage />} />` next to the catalog, with an automatic guest `SignInPage`; `Root.tsx` adds the sidebar item. `packages/backend/src/index.ts` adds app, proxy, auth (guest), catalog, permission (allow-all) and the about backend. `app-config.yaml` uses an in-memory `better-sqlite3` database and enables permissions.
- **Dependencies.** The two plugin packages do not depend on each other; the hosting app depends on both with `workspace:^`. `DevPortalInfo` is declared twice (frontend `src/types.ts`, backend `src/utils/types.ts`) and is kept in sync by hand.

## Testing

```pre
plugins/about/src/plugin.test.ts        # aboutPlugin is defined
packages/app/src/App.test.tsx           # App renders with a minimal APP_CONFIG
```

That is the whole suite: no backend test, no component test, no end-to-end test. The devDependencies for adding them are already declared: `@backstage/test-utils`, `@testing-library/react` and `msw` in the frontend; `@backstage/backend-test-utils`, `supertest` and `msw` in the backend.

- A frontend test that reaches the backend mocks `discoveryApiRef` and `identityApiRef` and stubs `global.fetch`, because `AboutClient` does not use `fetchApiRef`. Alternatively provide a fake `aboutApiRef` through `TestApiProvider`, as `dev/index.tsx` does.
- A backend integration test is `startTestBackend({ features: [aboutPlugin] })` followed by `GET /api/about/info`. A router unit test cannot inject a fake `AboutBackendApi` today (see Gotchas).

```sh
cd workspaces/about && yarn test:all --watchAll=false
cd workspaces/about/plugins/about && yarn test --watchAll=false
```

## Dynamic loading

`docker-compose.yaml` starts `veecode/devportal:latest` on port 7007 with `DEVELOPMENT=true` and `LOG_LEVEL=info`, and mounts read-only:

- `dynamic-plugins.yaml` → `/app/dynamic-plugins.yaml`
- `plugins/about-backend/dist-dynamic` → `/app/dynamic-plugins/dist/veecode-platform-backstage-plugin-about-backend-dynamic`
- `plugins/about/dist-dynamic` → `/app/dynamic-plugins/dist/veecode-platform-backstage-plugin-about-dynamic`

No app-config overlay is mounted. `dynamic-plugins.yaml` includes `dynamic-plugins.default.yaml`, enables both packages and configures the frontend under `veecode-platform.backstage-plugin-about`: an `appIcons` entry (`aboutIcon` → `AboutIcon`), a `dynamicRoutes` entry for `/about` (`AboutPage`, sidebar item "About") and a `menuItems.about` entry under `parent: admin`.

```sh
make build-dynamic
docker compose up          # verify at http://localhost:7007/about
docker compose down
```

As in dummy, the mounts are read at boot: after code changes run `make build-dynamic` and restart the container. This is the compose harness shared with `dummy` and `kong-tools`; its convergence with the `dynamic/` harness is decided in the planning repository.

## Mocks and external dependencies

- The backend has no external dependency: it reads the local `os` module and two JSON files at the target root. This workspace has no `devportal.json`, so `devportalVersion` comes back `'N/A'` in local runs.
- The frontend has one: `useSpec` fetches `https://raw.githubusercontent.com/veecode-platform/devportal/main/package.json` from the browser to compare the installed DevPortal version with the latest release. Nothing mocks it, not even `dev/index.tsx`. A failed fetch leaves `lastVersion` undefined, so `AboutTab` shows the "New" chip and an update message with an undefined version.
- `plugins/about/dev/index.tsx` uses `createDevApp`, registers `aboutPlugin`, replaces `aboutApiRef` with an inline `mockAboutApi` and mounts `AboutPage` at `/about`.
- `plugins/about-backend/dev/index.ts` starts `createBackend()` with `mockServices.auth` and `mockServices.httpAuth`, so `curl http://localhost:7007/api/about/info | jq` works without logging in.

## Gotchas

- `backstage.json` says 1.49.2 while the DevPortal host declares 1.52.0 (2026-09-10, planning repository ADR-0004). Moving `about` to the host line follows dummy's upgrade (M6 in the planning repository); do not bump ad hoc.
- Both plugins use the identifier `about` (frontend `id`, backend `pluginId`, `backstage.pluginId` in both `package.json`), so the API path is `/api/about/`, not `/api/about-backend/`. The directory name `about-backend` is not the `pluginId`.
- Both plugin objects are called `aboutPlugin` (named export in the frontend, default export in the backend). Alias one when importing both.
- The frontend public API is exactly `aboutPlugin`, `AboutPage`, `AboutIcon`; `dynamic-plugins.yaml` references the last two by `importName`. Renaming them breaks dynamic loading.
- `AboutClient` imports `@backstage/errors`, which `plugins/about/package.json` does not declare; it resolves today only because other packages in the workspace pull it in.
- `createRouter()` has no options and builds `AboutBackendApi` internally; the exported `RouterOptions` interface is unused. Anything that needs a fake service (tests, the `dev/` app) must add an injection point first.
- The Makefile default `VERSION` and the plugin `package.json` versions differ. `make publish` skips a version already on npm; `make publish-dynamic` publishes from `dist-dynamic/` with `|| true`, so a failed publish does not fail the target.
- Two export paths exist: the Makefile runs `npx @red-hat-developer-hub/cli@latest`, the package scripts run the `rhdh-cli` binary from the `@red-hat-developer-hub/cli` devDependency (range `latest`). Neither is pinned.
- `make build-dynamic` deletes module-federation leftovers (`remoteEntry.js`, `mf-manifest.json`, `mf-stats.json`, `@mf-types`, `compiled-types`) from the frontend `dist/` before exporting, as dummy does. Keep that step.
- Both plugin `package.json` list `config.d.ts` under `files`, but neither plugin has one and neither reads `app-config`.

## Decisions

No `DECISIONS.md` in this workspace. If one is added, entries are plugin decision records (`PDR-NNN`), cited as `about PDR-NNN`. Cross-workspace decisions are `plugins ADR-NNNN` in the planning repository `veecode-platform/devportal-plugins-parent`.
