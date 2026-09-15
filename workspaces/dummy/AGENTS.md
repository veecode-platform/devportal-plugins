# AGENTS.md — dummy workspace

Agent context for the reference workspace. Repository-wide rules, including the shape this file follows, are in the root [`AGENTS.md`](../../AGENTS.md). This file adds what is specific to `dummy` and carries the plugin patterns and code samples the other workspaces refer to.

## What the plugins do

- `plugins/dummy` — `@veecode-platform/backstage-plugin-dummy`, frontend, `id: 'dummy'`. Provides a full page at `/dummy` (`DummyPage`), an entity card (`DummyCard`), an entity tab (`DummyContent`), an icon (`DummyIcon`) and `DummyFetchComponent`, which reads paginated data from the backend plugin.
- `plugins/dummy-backend` — `@veecode-platform/backstage-plugin-dummy-backend`, backend, `pluginId: 'plugin-dummy-backend'`. One endpoint, `GET /teams?limit=&offset=`, served by `SoccerListService` from in-memory mock data (soccer teams). Reachable at `/api/plugin-dummy-backend/teams`.

Both packages are `private: true`: dummy is never published. The hosting app (`packages/app`, `packages/backend`) exists to run and test them.

## Layout

```pre
workspaces/dummy/
├── packages/
│   ├── app/                      # Frontend hosting app; App.tsx wires DummyPage at /dummy
│   │   ├── src/App.test.tsx      # Wiring test
│   │   └── e2e-tests/app.test.ts # Playwright smoke test
│   └── backend/                  # Backend hosting app; index.ts adds the dummy backend
│       └── src/index.test.ts     # Wiring test: endpoint responds
├── plugins/
│   ├── dummy/
│   │   ├── src/plugin.ts         # createPlugin + DummyPage routable extension
│   │   ├── src/routes.ts         # rootRouteRef
│   │   ├── src/index.ts          # Public exports
│   │   ├── src/components/       # DummyComponent, DummyFetchComponent, DummyCard, DummyContent, DummyIcons
│   │   └── dev/index.tsx         # Standalone dev app
│   └── dummy-backend/
│       ├── src/plugin.ts         # createBackendPlugin, DI of the service
│       ├── src/router.ts         # GET /teams
│       ├── src/services/SoccerListService.ts  # Service, service ref and factory
│       └── dev/index.ts          # Standalone backend with mocked auth
├── docker-compose.yaml           # Container harness (veecode/devportal:latest)
├── dynamic-plugins.yaml          # Enables both plugins; frontend routes, tabs, mount points
├── app-config.dynamic.yaml       # Overlay mounted as app-config.local.yaml (empty today)
├── app-config.yaml               # Local dev config
├── backstage.json                # Backstage release (1.49.2)
├── catalog-info.yaml             # create-app placeholder
├── playwright.config.ts
├── Makefile
├── README.md                     # For humans
├── LIFECYCLE.md                  # Develop → build → release loop against the Makefile
├── AGENTS.md                     # This file
└── CLAUDE.md                     # Thin pointer here
```

## Commands

Run from `workspaces/dummy/`.

| Command | Purpose |
|---------|---------|
| `yarn install` | Install |
| `yarn start` | Hosting app with both plugins loaded statically (hot reload) |
| `yarn tsc` | Type check |
| `yarn build:all` | Build every package |
| `yarn test:all` | All Jest suites with coverage (`backstage-cli repo test --coverage`) |
| `yarn lint:all` | Lint everything |
| `yarn test:e2e` | Playwright against a running app |
| `yarn update-backstage` | `backstage-cli versions:bump` (see Gotchas before using it) |
| `make build` | `yarn install && yarn tsc && yarn build:all` |
| `make build-dynamic` | `make build` + export both plugins to `dist-dynamic/` |
| `make clean-dynamic` / `make clean` | Remove `dist-dynamic/` only / everything including `node_modules` |
| `make set-version VERSION=x.y.z` | Rewrite both plugin versions, then `yarn install` |
| `docker compose up` / `down` | Load the exported plugins on a DevPortal container |

From a plugin directory: `yarn start` (standalone dev mode), `yarn test --watchAll=false`, `yarn build`, `yarn lint`. [`LIFECYCLE.md`](LIFECYCLE.md) walks through the whole loop.

## Architecture

### Frontend plugin pattern (`plugins/dummy/src`)

```typescript
// routes.ts
export const rootRouteRef = createRouteRef({ id: 'dummy' });

// plugin.ts — define the plugin and its routable extension
export const dummyPlugin = createPlugin({ id: 'dummy', routes: { root: rootRouteRef } });
export const DummyPage = dummyPlugin.provide(
  createRoutableExtension({
    name: 'DummyPage',
    component: () => import('./components/DummyComponent').then(m => m.DummyComponent),
    mountPoint: rootRouteRef,
  }),
);

// index.ts — public exports
export { dummyPlugin, DummyPage } from './plugin';
export { DummyCard } from './components/DummyCard';
export { DummyContent } from './components/DummyContent';
export { DummyIcon } from './components/DummyIcons';
```

### Backend plugin pattern (`plugins/dummy-backend/src`)

```typescript
// services/SoccerListService.ts — service, ref and factory (createServiceRef / createServiceFactory)
export const soccerListServiceRef = createServiceRef<Expand<SoccerListService>>({
  id: 'soccer.list',
  defaultFactory: async service => createServiceFactory({ service, deps: { logger: coreServices.logger }, factory: deps => SoccerListService.create(deps) }),
});

// plugin.ts — plugin with dependency injection
export const pluginDummyBackendPlugin = createBackendPlugin({
  pluginId: 'plugin-dummy-backend',
  register(env) {
    env.registerInit({
      deps: { httpRouter: coreServices.httpRouter, soccerList: soccerListServiceRef },
      async init({ httpRouter, soccerList }) {
        httpRouter.use(await createRouter({ soccerList }));
      },
    });
  },
});

// router.ts — express-promise-router; GET /teams reads limit/offset from the query
// index.ts — default export so the hosting app can `backend.add(import('@veecode-platform/backstage-plugin-dummy-backend'))`
```

### Frontend → backend call

`DummyFetchComponent` resolves the backend with `discoveryApi.getBaseUrl('plugin-dummy-backend')` and calls `fetchApi.fetch(`${baseUrl}/teams?limit=${pageSize}&offset=${offset}`)`. The argument to `getBaseUrl` is the backend `pluginId`, not the package name.

### Static vs dynamic

- **Static**: the hosting app depends on both packages; `packages/app/src/App.tsx` mounts `<Route path="/dummy" element={<DummyPage />} />` and `packages/backend/src/index.ts` adds the backend plugin.
- **Dynamic**: `make build-dynamic` runs `@red-hat-developer-hub/cli plugin export` in each plugin, producing `dist-dynamic/`. The container harness mounts those folders; nothing is published.

### Workspace dependencies

The two dummy packages do not depend on each other; they only list each other in `backstage.pluginPackages`. Workspaces with a `-common` package depend on it with `workspace:^` (or `workspace:*`) and must resolve that to a real version before publishing (see `github-workflows`' `replace-workspace` target).

## Testing

### Stack

- **Frontend plugin**: Jest + `@testing-library/react` + `@backstage/test-utils` (`renderInTestApp`, `TestApiProvider`).
- **Backend plugin**: Jest + `supertest` + `@backstage/backend-test-utils` (`startTestBackend`, `mockServices`).
- **Hosting app**: the same two stacks for `packages/app` and `packages/backend`.
- **End-to-end**: Playwright (`playwright.config.ts`, `packages/app/e2e-tests/app.test.ts`).

### Organization

```pre
plugins/dummy/src/
├── plugin.test.ts                                      # Plugin export verification
└── components/
    ├── DummyComponent/DummyComponent.test.tsx          # Full-page component rendering
    ├── DummyFetchComponent/DummyFetchComponent.test.tsx # Backend call with mocked discovery + fetch
    ├── DummyCard/DummyCard.test.tsx                    # Entity card rendering
    └── DummyContent/DummyContent.test.tsx              # Entity tab rendering

plugins/dummy-backend/src/
├── plugin.test.ts                                      # Integration: startTestBackend + real service
└── router.test.ts                                      # Unit: createRouter with a mocked service

packages/app/src/App.test.tsx                           # App renders; plugin exports wired
packages/backend/src/index.test.ts                      # Backend wiring; endpoint responds
packages/app/e2e-tests/app.test.ts                      # Playwright smoke
```

### Frontend test pattern

Components that call the backend need both `discoveryApiRef` and `fetchApiRef` mocked:

```tsx
const mockDiscoveryApi = {
  getBaseUrl: jest.fn().mockResolvedValue('http://localhost:7007/api/plugin-dummy-backend'),
};
const mockFetchApi = {
  fetch: jest.fn().mockResolvedValue({
    ok: true,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => ({ teams: [], totalCount: 0, limit: 10, offset: 0 }),
  }),
} as any;

await renderInTestApp(
  <TestApiProvider apis={[[discoveryApiRef, mockDiscoveryApi], [fetchApiRef, mockFetchApi]]}>
    <DummyFetchComponent />
  </TestApiProvider>,
);
```

### Backend test patterns

Integration (real service through the backend system):

```typescript
const { server } = await startTestBackend({ features: [pluginDummyBackendPlugin] });
const res = await request(server).get('/api/plugin-dummy-backend/teams');
expect(res.status).toBe(200);
```

Unit (router with a mocked service):

```typescript
const soccerList = { listTeams: jest.fn().mockResolvedValue({ teams: [], totalCount: 0, limit: 10, offset: 0 }) };
const app = express().use(await createRouter({ soccerList }));
const res = await request(app).get('/teams');
```

### Running tests

Always pass `--watchAll=false` from the command line, or Jest stays in watch mode:

```sh
cd workspaces/dummy && yarn test:all --watchAll=false
cd workspaces/dummy/plugins/dummy && yarn test --watchAll=false
```

No GitHub workflow runs these suites; run them locally before pushing.

## Dynamic loading

`docker-compose.yaml` starts `veecode/devportal:latest` on port 7007 and mounts:

- `app-config.dynamic.yaml` → `/app/app-config.local.yaml`
- `dynamic-plugins.yaml` → `/app/dynamic-plugins.yaml`
- `plugins/dummy/dist-dynamic` → `/app/dynamic-plugins/dist/veecode-platform-backstage-plugin-dummy-dynamic`
- `plugins/dummy-backend/dist-dynamic` → `/app/dynamic-plugins/dist/veecode-platform-backstage-plugin-dummy-backend-dynamic`

`dynamic-plugins.yaml` enables both packages and gives the frontend its `appIcons` (`DummyIcon`), a `dynamicRoutes` entry for `/dummy` with a sidebar item, an `entityTabs` entry (`/dummy-tab`, mount point `entity.page.dummy`) and a `mountPoints` entry that places `DummyCard` under `entity.page.dummy/cards`.

```sh
make build-dynamic
docker compose up          # verify at http://localhost:7007
docker compose down
```

No hot reload: both YAML files are read at boot. Code changes need `make build-dynamic` plus `docker compose restart`; config-only changes need only a restart. This is the compose harness against the 2.x image; `github-workflows`, `gitlab-pipelines` and `kubernetes` use a `dynamic/` folder instead. Which one becomes the standard is decided in the planning repository (M4).

## Mocks and external dependencies

None external. The backend generates its data in `SoccerListService`.

- `plugins/dummy-backend/dev/index.ts` starts a minimal backend with `mockServices.auth` and `mockServices.httpAuth`, so `curl http://localhost:7007/api/plugin-dummy-backend/teams` works without logging in.
- `plugins/dummy/dev/index.tsx` uses `createDevApp` to render `DummyPage` at `/dummy` without the hosting app.

## Gotchas

- The backend `pluginId` is `plugin-dummy-backend`, not `dummy-backend`. The API path and the `getBaseUrl` argument must match it.
- Both packages are `private: true`. `make publish` is refused by npm by design, and `make get-version` reports "Not published yet".
- The Makefile default `VERSION` (0.2.0) and the `package.json` versions (0.1.0) differ. `make set-version VERSION=x.y.z` writes the value you pass into both `package.json` files.
- `backstage.json` says 1.49.2 while the DevPortal host declares 1.52.0 (2026-09-10). Moving dummy to the host line is a planned milestone (M6 in the planning repository); do not bump ad hoc.
- `make build-dynamic` deletes module-federation leftovers from the frontend `dist/` (`remoteEntry.js`, `mf-manifest.json`, `mf-stats.json`, `@mf-types`, `compiled-types`) before exporting. Keep that step when copying the target.
- `catalog-info.yaml` is the `create-app` placeholder (`owner: john@example.com`). Its fate is decided by standard 01 in the planning repository; do not fill it in ad hoc.

## Decisions

This workspace keeps no `DECISIONS.md`. If it ever needs one, entries are plugin decision records (`PDR-001`, `PDR-002`, …), cited as `dummy PDR-NNN`. Cross-workspace decisions are `plugins ADR-NNNN` in the planning repository; ADR-0003 makes dummy the reference implementation.
