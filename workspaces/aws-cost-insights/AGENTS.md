# AGENTS.md — aws-cost-insights workspace

Agent context for this workspace. Repository-wide rules, including the shape this file follows, are in the root [`AGENTS.md`](../../AGENTS.md).

## What the plugins do

AWS Cost Explorer spend inside the catalog (per user group, per linked account or org-wide) plus OpenCost (Kubernetes) allocation cards. One in-house frontend, three vendored `@aws` packages.

- `plugins/aws-cost-insights` — `@veecode-platform/plugin-aws-cost-insights`, frontend, `id: 'aws-cost-insights'`, in-house. Registers `CostExplorerClient` as the `costInsightsApiRef` implementation of `@backstage-community/plugin-cost-insights`. Exports `CostInsightsPage` (group / AWS account / organization selector, period picker, total and per-service tabs, `GlobalClusterCostCard` below), `EntityCostInsightsContent` (entity card: AWS cost from the entity annotation plus an OpenCost monthly projection, consolidated in a TCO banner), `EntityClusterCostCard`, `GlobalClusterCostCard`, `CostInsightsIcon`, the `pt` translation resource (`costInsightsTranslations`, ref id `plugin.aws-cost-insights`) and two instruction pages re-exported from the community plugin. `costInsightsAwsPlugin` is an alias of `awsCostInsightsPlugin`.
- `plugins/cost-insights-backend` — `@aws/cost-insights-plugin-for-backstage-backend`, backend, `pluginId: 'cost-insights-aws'`, vendored. Under `/api/cost-insights-aws/`: `GET /v1/entity/:namespace/:kind/:name/:intervals`, `GET /v1/projects` (linked accounts with usage in the last 90 days), `GET /v1/project/:project/:intervals` (`project` must be a 12-digit account id), `GET /v1/org/:intervals`, `GET /health` (unauthenticated). Every `/v1/*` route is gated by the `cost-insights-aws.cost.read` permission. Also registers the `get-cost-insights-aws-history` action in the alpha `actionsRegistryServiceRef`.
- `plugins/cost-insights-common` — `@aws/cost-insights-plugin-for-backstage-common`, vendored. Annotation constants (`aws.amazon.com/cost-insights-tags`, `aws.amazon.com/cost-insights-cost-categories`, `aws.amazon.com/account-id`) and `costInsightsAwsReadPermission`.
- `plugins/aws-core-common` — `@aws/aws-core-plugin-for-backstage-common`, vendored. `getOneOfEntityAnnotations`, `generateShortcutLink`, `AWS_SDK_CUSTOM_USER_AGENT`.

Each `@aws` package carries a `NOTICE`: vendored from `awslabs/backstage-plugins-for-aws` through the retired fork `veecode-platform/backstage-plugins-for-aws` at commit `cf408c11`, Apache-2.0, with VeeCode modifications (RBAC permission gate, org-wide route, per-account projects, entity account-id filter). Each NOTICE cites `aws-cost-insights PDR-001` in [`DECISIONS.md`](DECISIONS.md) for those modifications.

## Layout

```pre
workspaces/aws-cost-insights/
├── packages/
│   ├── app/                          # Frontend hosting app: registers the translations and a sidebar item
│   │   ├── src/App.test.tsx
│   │   └── e2e-tests/app.test.ts     # Playwright test; no playwright.config.ts in this workspace
│   └── backend/                      # Package name `backend-dev`: auth (guest), catalog, permission (allow-all) + this backend
├── plugins/
│   ├── aws-cost-insights/            # In-house frontend; no dev/ folder
│   │   ├── src/plugin.ts             # createPlugin + costInsightsApiRef factory
│   │   ├── src/api/                  # CostExplorerClient (backend), OpenCostClient (proxy)
│   │   ├── src/components/           # CleanCostInsightsPage, CleanEntityCostCard, EntityClusterCostCard, GlobalClusterCostCard, RichPeriodSelect
│   │   └── src/translations/         # ref.ts (en messages), pt.ts
│   ├── cost-insights-backend/        # Vendored: NOTICE, upstream CHANGELOG.md
│   │   ├── src/service/              # router.ts, CostExplorerCostInsightsAwsService.ts, types.ts
│   │   ├── src/config/               # aws.costInsights.* reader
│   │   ├── src/cache/                # CostInsightsCache
│   │   ├── src/actions/trailing.ts   # actions-registry action
│   │   └── dev/index.ts              # Standalone backend with guest auth
│   ├── cost-insights-common/         # Vendored: annotations + permission
│   └── aws-core-common/              # Vendored: annotation helper, SDK user agent
├── app-config.yaml                   # create-app style config for the hosting app
├── app-config.backend-dev.yaml       # Minimal backend-only config (aws.accounts, costMetric, permissions)
├── backstage.json                    # 1.49.2
├── Makefile                          # Every target acts on plugins/aws-cost-insights only
├── package.json                      # name: aws-cost-insights-workspace
├── .yarnrc.yml                       # yarnPath .yarn/releases/yarn-4.4.1.cjs (committed), nodeLinker node-modules
├── AGENTS.md                         # This file
└── CLAUDE.md
```

No `README.md`, `DECISIONS.md`, `catalog-info.yaml`, `docker-compose.yaml`, `dynamic-plugins.yaml` or `dynamic/` folder exists in this workspace.

## Commands

Run from `workspaces/aws-cost-insights/`. The standard `yarn` scripts of the root `AGENTS.md` are present, plus `yarn test` (no coverage), `yarn tsc:full`, `yarn clean`, `yarn lint` (since `origin/main`) and `yarn prettier:check`.

| Command | Purpose |
|---------|---------|
| `make build` | `yarn install && yarn tsc && yarn build:all` |
| `make build-dynamic` | `make build`, then deletes module-federation leftovers from the frontend `dist/` and runs `npx @red-hat-developer-hub/cli@latest plugin export` there |
| `make pack` / `make pack-dynamic` | `npm pack` in the frontend plugin / in its `dist-dynamic/` |
| `make publish` / `make publish-dynamic` | Publish the frontend plugin (skips an already-published version) / publish its `dist-dynamic/` |
| `make set-version VERSION=x.y.z` | Rewrites `plugins/aws-cost-insights/package.json` only, then `yarn install` |
| `make get-version` / `make unpublish` | `npm view` / `npm unpublish` for the frontend plugin only |
| `make clean` / `make clean-dynamic` | Remove root `node_modules` and the frontend's `node_modules`, `dist`, `dist-dynamic`, `*.tgz` / only `dist-dynamic` |

From `plugins/aws-cost-insights/`: `yarn export-dynamic` (`rhdh-cli plugin export`), `yarn export-dynamic:clean`, `yarn test --watchAll=false`, `yarn build`, `yarn lint`, `yarn lint:fix`, `yarn tsc`. From `plugins/cost-insights-backend/`: `yarn start` runs `dev/index.ts`.

## Architecture

- **Frontend plugin** (`plugins/aws-cost-insights/src/plugin.ts`): `createPlugin` with `rootRouteRef` (`id: 'cost-insights-aws'`) and one API factory, `costInsightsApiRef` → `new CostExplorerClient(discoveryApi, fetchApi, catalogApi)`. No routable extension is provided: `CostInsightsPage` and the cards are plain React components exported from `src/index.ts`; `rootRouteRef` is declared but nothing mounts on it. The host places the components.
- **`CostExplorerClient`** implements the community `CostInsightsApi`: `getUserGroups` queries the catalog for `Group` entities with `relations.hasMember` = the user; `getGroupProjects` → `GET v1/projects`; `getGroupDailyCost` delegates to `getCatalogEntityDailyCost` → `GET v1/entity/...`; `getProjectDailyCost` → `GET v1/project/...`; `getOrgDailyCost` → `GET v1/org/...` is an extra method outside the upstream contract (the page widens the type locally). `getAlerts` returns `[]`; `getDailyMetricData` and `getProductInsights` throw `Not implemented`. Base URL: `discoveryApi.getBaseUrl('cost-insights-aws')`.
- **Page flow** (`CleanCostInsightsPage`): identity → `getUserGroups` → keep only groups whose entity carries the tags or cost-categories annotation (`catalogApi.getEntitiesByRefs`; on lookup failure the list is kept unfiltered) → `getGroupProjects('')` fills the account selector (failure is silent) → daily cost for group (`all`), project or `org`. Intervals are ISO 8601 repeating intervals `R<n>/P1D/<yyyy-mm-dd>`; the page defaults to `R90`, the entity card to `R30`; `RichPeriodSelect` offers 30/60/90/180 days and a custom range.
- **Entity card** (`CleanEntityCostCard`): without the annotation it renders a setup hint and calls nothing. Otherwise it fetches the entity cost and, in parallel, OpenCost allocations, matching the namespace by `backstage.io/kubernetes-namespace`, `backstage.io/kubernetes-id` or the entity name (exact match only) and projecting daily cost × `DAYS_IN_MONTH` (30.5).
- **OpenCost** (`src/api/OpenCostClient.ts`): `GET {proxy}/opencost/allocation/compute?window=yesterday&aggregate=namespace` via `discoveryApi.getBaseUrl('proxy')`. The host must provide a `/opencost` proxy endpoint.
- **Backend plugin** (`plugins/cost-insights-backend/src/plugin.ts`): reads `aws.costInsights.*`, adds the permission to `permissionsRegistry`, mounts the router, marks `/health` unauthenticated, registers the action. The service is `costInsightsAwsServiceRef` (`id: 'cost-insights-aws.api'`) with a default factory: `CostExplorerCostInsightsAwsService.fromConfig` using `catalogServiceRef` and `DefaultAwsCredentialsManager.fromConfig(config)` from `@backstage/integration-aws-node` (`aws.accounts`; `costExplorer.accountId` picks the account).
- **Router order** (`src/service/router.ts`): the `/v1` permission middleware runs before the cache middleware (key `req.originalUrl`, prefix `cost-insights:`), so a cache hit never bypasses authorization; a DENY is a 403 via `NotAllowedError`.
- **Config** (`src/config/config.ts`): `aws.costInsights.costExplorer.{accountId,region,costMetric}` (`costMetric` defaults to `UnblendedCost` and is validated against the Cost Explorer metric enum), `aws.costInsights.entityGroups[].{kind,groups[].{name,key,type}}` (an entry with `kind: 'Project'` enables grouped costs for the account and org views), `aws.costInsights.cache.{enable,defaultTtl,readTimeout}` (defaults `true`, `86400000`, `1000`).
- **Service** (`CostExplorerCostInsightsAwsService`): builds a Cost Explorer `Expression` from the annotation (`Tags` or `CostCategories`, comma-separated `Key=Value`), ANDs a `LINKED_ACCOUNT` dimension when `aws.amazon.com/account-id` is a 12-digit id (warns and ignores otherwise), `GetCostAndUsage` for totals and per-group breakdowns, paginated `GetDimensionValues LINKED_ACCOUNT` over a 90-day window for projects, and a linear-regression trendline.
- **Workspace dependencies**: `cost-insights-backend` depends on both `-common` packages with `workspace:^`; `packages/app` on the frontend and `packages/backend` on the backend, both `workspace:^`. The frontend depends on no `@aws` package; it reaches the backend only over HTTP.

## Testing

Frontend: Jest + `@testing-library/react` + `@backstage/test-utils` (`renderInTestApp`, `TestApiProvider`, `mockApis.translation()`). Backend: Jest + `supertest` + `@backstage/backend-test-utils` (`mockServices`, `mockCredentials`) + `aws-sdk-client-mock` for the Cost Explorer client. The two `-common` packages and `packages/backend` have no tests.

```pre
plugins/aws-cost-insights/src/
├── plugin.test.ts                              # Plugin export
├── api/CostExplorerClient.test.ts              # getUserGroups ref normalization, billing date
├── api/OpenCostClient.test.ts                  # Exact namespace matching, proxy fetch, window=yesterday
└── components/
    ├── CleanCostInsightsPage.test.tsx          # Group filtering by annotation; account/org selector → API calls
    └── CleanEntityCostCard.test.tsx            # TCO state machine: no annotation, loading, TCO, cloud-only, errors

plugins/cost-insights-backend/src/service/
├── router.test.ts                              # /health open; /v1 DENY → 403, even with a primed cache
└── CostExplorerCostInsightsAwsService.test.ts  # Filters, grouped costs, account-id AND, projects pagination, org view

packages/app/src/App.test.tsx
packages/app/e2e-tests/app.test.ts              # Playwright
```

Chart-rendering tests polyfill `ResizeObserver` (recharts `ResponsiveContainer` in JSDOM). `CleanEntityCostCard.test.tsx` mocks `useEntity` with `jest.mock('@backstage/plugin-catalog-react')`. There is no `startTestBackend` integration test; the router test builds `createRouter` with a `jest.fn()` `CostInsightsAwsService`. Run `yarn test:all` from the workspace or `yarn test --watchAll=false` from a plugin.

## Dynamic loading

Only the frontend is exported: `make build-dynamic` or `yarn export-dynamic` produces `plugins/aws-cost-insights/dist-dynamic/`. The three `@aws` packages have no export script and are not in the Makefile's `ALL_PLUGIN_DIRS`. This workspace has no container harness (no compose files, no `dynamic/` folder); proving the exported artifact on a DevPortal container has to happen elsewhere. The export toolchain is unpinned: `@red-hat-developer-hub/cli` is `latest` in the plugin's devDependencies and `npx @red-hat-developer-hub/cli@latest` in the Makefile.

## Mocks and external dependencies

- External: AWS Cost Explorer (`@aws-sdk/client-cost-explorer`) with credentials from `@backstage/integration-aws-node` (`aws.accounts`; `app-config.backend-dev.yaml` ships an empty list to fill locally), the Backstage catalog (group membership, entity annotations) and OpenCost behind the Backstage `proxy` plugin at `/opencost`.
- No mock service or mock client exists in this workspace. Tests mock at the boundary: `aws-sdk-client-mock` for Cost Explorer, `jest.fn()` implementations of `CostInsightsAwsService`, `costInsightsApiRef`, `catalogApiRef` and `fetchApiRef`.
- `plugins/cost-insights-backend/dev/index.ts`: `createBackend()` + auth backend + guest provider + this plugin, no `mockServices`; `/v1/*` requests go to Cost Explorer with whatever credentials the config and environment provide.
- `packages/backend/src/index.ts`: auth, guest provider, catalog backend, permission backend, allow-all policy, this backend. `app-config.backend-dev.yaml` is its minimal config (`app.baseUrl` for the auth plugin, guest provider, `aws.accounts: []`, `costMetric: AmortizedCost`, `permission.enabled: true`); nothing in `package.json` or the `Makefile` loads it, so pass it to the start command yourself.
- `packages/app`: guest sign-in, `costInsightsTranslations` registered through `__experimentalTranslations`, `CostInsightsIcon` sidebar item.

## Gotchas

- Identifiers are mirrored on purpose: frontend `id` and `backstage.pluginId` are `aws-cost-insights`; the backend `pluginId`, the API path, the `getBaseUrl` argument, the `rootRouteRef` id and the permission prefix are `cost-insights-aws`. Do not align either side.
- The hosting app wires only the translations and the icon: `Root.tsx` has a sidebar item `to="cost-insights"`, but `App.tsx` mounts no route for `CostInsightsPage` and `EntityPage.tsx` never places `EntityCostInsightsContent`. The sidebar link has no matching route.
- `plugins/aws-cost-insights` has no `dev/` folder, so its `start` script has no entry point; use the hosting app.
- The OpenCost cards call `/api/proxy/opencost/...`; `app-config.yaml` defines no proxy endpoints (the block is commented out), so they render their unavailable state locally. Its catalog locations also point at `../../examples/*.yaml`, and no `examples/` directory exists here.
- `backstage.json` says 1.49.2 while the DevPortal host declares 1.52.0 (2026-09-10, plugins ADR-0004). Moving to the host line is planned in the planning repository; do not bump ad hoc.
- The three `@aws` packages are not `private: true`; each has `publishConfig.access: public` and `repository.url: github:awslabs/backstage-plugins-for-aws`. They cannot be published from VeeCode's npm account (`@aws` is a third-party scope, planning inventory `docs/inventory/plugins.md`) and the Makefile excludes them. Consume them through `workspace:^` only.
- Upstream manifest metadata was kept as vendored: `repository.directory` says `plugins/ecs/backend` and `plugins/ecs/common`, the common package `description` mentions the ECS plugin, and both `backstage.pluginPackages` lists include `@aws/cost-insights-plugin-for-backstage` (the upstream frontend, absent here). The `CHANGELOG.md` files are upstream's. Do not trust them for this workspace; never edit the `NOTICE` files.
- `make set-version` rewrites only the frontend `package.json`; the vendored packages keep their upstream versions. The Makefile default `VERSION` and the frontend `package.json` version differ.
- `packages/backend` is named `backend-dev` in its `package.json`, and the workspace `package.json` is `aws-cost-insights-workspace` where other workspaces use `root`.

## Decisions

Design decisions live in [`DECISIONS.md`](DECISIONS.md) as plugin decision records, cited elsewhere as `aws-cost-insights PDR-NNN`, never as ADRs. `PDR-001` records why the `@aws` packages are vendored rather than forked and what VeeCode changed in them; `PDR-002` records the byte-parity gate used to prove the cutover and its removal the next day. New entries start at `PDR-003`.

The sibling `aws-s3-catalog` workspace took its own decisions on the same questions and keeps its own log; the two are independent records, not one decision spanning both.

Cross-workspace decisions are `plugins ADR-NNNN` in the planning repository `veecode-platform/devportal-plugins-parent`.
