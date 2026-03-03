# AI Agent Guidelines

This document provides detailed technical context for AI agents working with this repository. Humans should read `README.md` instead.

This project is a collection of Backstage plugins for the VeeCode Platform. Each top level workspace is a self-contained Backstage hosting app (packages "app" and "backend" under "packages" folder) with Yarn workspaces for the plugins (under "plugins" folder). This way correlated plugins are grouped together and tested together in the same hosting app.

## Repository Layout

```pre
devportal-plugins/
├── workspace/                    # All workspaces live here
│   ├── dummy/                    # Reference implementation — start here
│   ├── homepage/
│   ├── global-header/
│   ├── github-workflows/
│   ├── ldap-auth/
│   ├── kong-tools/
│   ├── kubernetes/
│   └── about/
├── Makefile                      # Root-level cross-workspace utilities
├── ROADMAP.md                    # Current project roadmap and task tracking
├── CLAUDE.md                     # Claude Code-specific instructions
└── AGENTS.md                     # This file
```

There is **no root `package.json`**. Each workspace manages its own dependencies independently.

## Workspace Internal Structure

Every workspace is a self-contained Backstage app with Yarn workspaces:

```pre
workspace/<name>/
├── packages/
│   ├── app/                      # Backstage frontend hosting app (for dev/testing only)
│   │   └── src/App.tsx           # Route registration, plugin wiring
│   └── backend/                  # Backstage backend hosting app (for dev/testing only)
│       └── src/index.ts          # Backend plugin registration
├── plugins/
│   ├── <plugin-name>/            # Frontend or backend plugin package
│   │   ├── src/
│   │   │   ├── plugin.ts         # Plugin definition (createPlugin / createBackendPlugin)
│   │   │   ├── index.ts          # Public exports
│   │   │   └── components/       # Frontend components (frontend plugins only)
│   │   ├── dev/index.tsx         # Standalone dev mode
│   │   └── package.json
│   ├── <plugin-name-backend>/    # Backend plugin (if workspace has both)
│   ├── <plugin-name-common>/     # Common library (ex: shared types, utils, etc., if present)
│   └── <plugin-name-another>/    # Other plugins (scaffolders, modules, etc.)
├── package.json                  # Workspace root — scripts, devDependencies
├── Makefile                      # Build, publish, clean targets
├── app-config.yaml               # Backstage config for local dev
├── tsconfig.json                 # TypeScript configuration
├── docker-compose.yaml           # Dynamic plugin testing (if present)
├── dynamic-plugins.yaml          # Dynamic plugin config (if present)
└── app-config.dynamic.yaml       # Dynamic app config overlay (if present)
```

**The hosting app is not published.** Only the `plugins/*` packages are released. The hosting app exists solely for development and testing.

## Workspace Inventory

| Workspace | Plugin Directories | NPM Packages | Dynamic | Notes |
|-----------|-------------------|--------------|---------|-------|
| dummy | `plugins/dummy`, `plugins/dummy-backend` | `@veecode-platform/backstage-plugin-dummy`, `@veecode-platform/backstage-plugin-dummy-backend` | Yes | Reference implementation |
| homepage | `plugins/veecode-homepage` | `@veecode-platform/backstage-plugin-veecode-homepage` | Yes | Also has `mui4-test`, `mui5-test` helper plugins |
| global-header | `plugins/veecode-global-header` | `@veecode-platform/backstage-plugin-veecode-global-header` | Yes | |
| github-workflows | `plugins/github-workflows`, `plugins/github-workflows-common`, `plugins/github-workflow-backend` | `@veecode-platform/backstage-plugin-github-workflows`, `-common`, `-backend` | Yes | Has `replace-workspace`/`restore-workspace` Makefile targets for `workspace:*` dep handling |
| ldap-auth | `plugins/ldap-auth`, `plugins/ldap-auth-backend` | `@veecode-platform/backstage-plugin-ldap-auth`, `-backend` | **No** | Static only — no dynamic plugin support |
| kong-tools | `plugins/scaffolder-backend-module-kong`, `plugins/kong-service-manager`, `plugins/kong-service-manager-backend`, `plugins/kong-service-manager-common`, `plugins/scaffolder-field-extensions-kong` | `@veecode-platform/backstage-plugin-*` | Yes | Largest workspace (5 plugins) |
| kubernetes | `plugins/kubernetes-backend-module-getsecret` | `@veecode-platform/backstage-plugin-kubernetes-backend-module-getsecret` | Yes | WIP |
| about | `plugins/about`, `plugins/about-backend` | `@veecode-platform/backstage-plugin-about`, `-backend` | Yes | Ready to use. |

## Commands Reference

### Per-Workspace (run from `workspace/<name>/`)

| Command | Purpose |
|---------|---------|
| `yarn install` | Install dependencies |
| `yarn tsc` | TypeScript type checking |
| `yarn build:all` | Build all packages in workspace |
| `yarn test:all` | Run all tests (plugins + hosting app) |
| `yarn test:all --coverage` | Run all tests with coverage report |
| `yarn lint:all` | Lint all files |
| `yarn start` | Start the Backstage hosting app |
| `yarn update-backstage` | Upgrade Backstage dependencies |

### Per-Plugin (run from `plugins/<name>/`)

| Command | Purpose |
|---------|---------|
| `yarn test --watchAll=false` | Run plugin tests (always use `--watchAll=false` to prevent hanging) |
| `yarn start` | Run plugin in standalone dev mode |
| `yarn build` | Build the plugin |
| `yarn lint` | Lint the plugin |

### Makefile Targets (run from `workspace/<name>/`)

| Target | Purpose |
|--------|---------|
| `make build` | `yarn install && yarn tsc && yarn build:all` |
| `make build-dynamic` | Build static + export dynamic plugins via `@red-hat-developer-hub/cli` |
| `make pack` / `make pack-dynamic` | Create `.tgz` archives |
| `make publish` / `make publish-dynamic` | Publish to npm (skips already-published versions) |
| `make set-version VERSION=x.y.z` | Update version in all plugin `package.json` files |
| `make get-version` | Show latest published version from npm registry |
| `make unpublish` | Unpublish current version from npm |
| `make clean` | Remove `node_modules`, `dist`, `dist-dynamic`, logs, `.tgz` files |
| `make clean-dynamic` | Remove only `dist-dynamic/` directories |

### Root Makefile (run from repo root)

| Target | Purpose |
|--------|---------|
| `make copy-dynamic-plugins` | Copy built dynamic plugins to local devportal-base |
| `make echo-paths` | Show `DEVPORTAL_BASE_PATH` and `DYNAMIC_PLUGIN_ROOT` |

## Plugin Architecture

### Static vs Dynamic Plugins

- **Static plugins** are standard npm packages imported at build time via `yarn add` and registered in `packages/app/src/App.tsx` (frontend) or `packages/backend/src/index.ts` (backend).
- **Dynamic plugins** are exported using `@red-hat-developer-hub/cli plugin export`, which creates a `dist-dynamic/` directory inside each plugin. Dynamic plugins are loaded at runtime by RHDH/DevPortal without rebuilding the app.

### Frontend Plugin Pattern

```typescript
// plugin.ts — define the plugin and its extensions
export const myPlugin = createPlugin({ id: 'my-plugin', routes: { root: rootRouteRef } });
export const MyPage = myPlugin.provide(createRoutableExtension({ ... }));

// index.ts — public exports
export { myPlugin, MyPage } from './plugin';
export { MyCard } from './components/MyCard';
```

### Backend Plugin Pattern

```typescript
// plugin.ts — define the backend plugin with dependency injection
export const myBackendPlugin = createBackendPlugin({
  pluginId: 'my-plugin-backend',
  register(env) {
    env.registerInit({
      deps: { httpRouter: coreServices.httpRouter, myService: myServiceRef },
      async init({ httpRouter, myService }) {
        httpRouter.use(await createRouter({ myService }));
      },
    });
  },
});

// index.ts — default export for backend.add(import(...))
export { myBackendPlugin as default } from './plugin';
```

### Workspace Dependencies

Plugins within the same workspace use `workspace:^` in `package.json` for internal dependencies (e.g., a frontend plugin depending on a common package). Before publishing, some workspaces replace these with real version numbers via Makefile `replace-workspace` target.

## Testing Patterns

### Test Stack

- **Frontend plugins**: Jest + `@testing-library/react` + `@backstage/test-utils` (`renderInTestApp`, `TestApiProvider`)
- **Backend plugins**: Jest + `supertest` + `@backstage/backend-test-utils` (`startTestBackend`)
- **Hosting app**: Same stack as frontend for `packages/app`, backend-test-utils for `packages/backend`
- **E2E**: Playwright (config exists in dummy, not extensively used yet)

### Test Organization (reference: dummy workspace)

```pre
plugins/dummy/src/
├── plugin.test.ts                              # Plugin export verification
└── components/
    ├── DummyComponent/DummyComponent.test.tsx   # Full-page component rendering
    ├── DummyFetchComponent/DummyFetchComponent.test.tsx  # API integration with mocked fetch
    ├── DummyCard/DummyCard.test.tsx             # Entity card rendering
    └── DummyContent/DummyContent.test.tsx       # Entity tab content rendering

plugins/dummy-backend/src/
├── plugin.test.ts                              # Integration test with real service (startTestBackend)
└── router.test.ts                              # Unit test with mocked service

packages/app/src/
└── App.test.tsx                                # App render + plugin export wiring verification

packages/backend/src/
└── index.test.ts                               # Backend wiring — verifies plugin endpoint responds
```

### Frontend Test Pattern

Frontend tests must mock both `discoveryApiRef` and `fetchApiRef` when testing components that call the backend:

```tsx
const mockDiscoveryApi = {
  getBaseUrl: jest.fn().mockResolvedValue('http://localhost:7007/api/my-plugin-backend'),
};
const mockFetchApi = {
  fetch: jest.fn().mockResolvedValue({
    ok: true,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => ({ /* mock response */ }),
  }),
} as any;

await renderInTestApp(
  <TestApiProvider apis={[[discoveryApiRef, mockDiscoveryApi], [fetchApiRef, mockFetchApi]]}>
    <MyComponent />
  </TestApiProvider>,
);
```

### Backend Test Patterns

**Integration test** (uses real service implementation):

```typescript
const { server } = await startTestBackend({ features: [myBackendPlugin] });
const res = await request(server).get('/api/my-plugin-backend/endpoint');
expect(res.status).toBe(200);
```

**Unit test** (mocked service):

```typescript
const mockService = { myMethod: jest.fn().mockResolvedValue(data) };
const router = await createRouter({ myService: mockService });
const app = express().use(router);
const res = await request(app).get('/endpoint');
```

### Running Tests

Always use `--watchAll=false` when running tests from the command line to prevent Jest from hanging in watch mode:

```bash
# All tests in a workspace
cd workspace/<name> && yarn test:all --watchAll=false

# Single plugin
cd workspace/<name>/plugins/<plugin> && yarn test --watchAll=false
```

## Dynamic Plugin Testing with Docker

Workspaces with dynamic plugin support include Docker Compose files:

- `docker-compose.yaml` — runs `veecode/devportal:latest` container on port 7007
- `dynamic-plugins.yaml` — enables plugins and configures frontend routes/mount points
- `app-config.dynamic.yaml` — minimal app config overlay

Workflow:

```bash
make build-dynamic          # Build dynamic plugin bundles
docker compose up           # Start DevPortal container with plugins mounted
# Verify at http://localhost:7007
docker compose down
```

The `dist-dynamic/` directories are mounted into `/app/dynamic-plugins/dist/` inside the container.

## Key Constraints

1. **No root package.json** — each workspace is fully independent. Do not try to run `yarn` from the repo root.
2. **Always `cd` into a workspace first** — all `yarn` and `make` commands must run from within a workspace directory.
3. **`--watchAll=false` is mandatory** for CI/scripted test runs — Jest watch mode will hang.
4. **ldap-auth is static-only** — it does not support dynamic plugin export.
5. **`about` workspace has no hosting app** — it cannot run `yarn start` yet.
6. **Plugin IDs matter** — backend plugins use `pluginId` from `createBackendPlugin`, which determines the API path (`/api/<pluginId>/`). Frontend plugins use `id` from `createPlugin`.
7. **`workspace:^` dependencies** — must be resolved before npm publish. Some workspaces handle this via Makefile targets.

## Reference Implementation

The **dummy workspace** (`workspace/dummy/`) is the canonical example. When creating a new workspace or standardizing an existing one, refer to dummy for:

- Makefile structure and targets
- Plugin package.json scripts and metadata (`backstage.role`, `pluginId`, `publishConfig`)
- Test patterns and coverage (plugin tests, wiring tests)
- Docker Compose dynamic plugin testing setup
- README documentation structure
