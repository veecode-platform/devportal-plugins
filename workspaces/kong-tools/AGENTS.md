# AGENTS.md — kong-tools workspace

Agent context for this workspace. Repository-wide rules, including the shape this file follows, are in the root [`AGENTS.md`](../../AGENTS.md). This is the largest workspace in the repository: five packages.

## What the plugins do

- `plugins/kong-service-manager` — `@veecode-platform/backstage-plugin-kong-service-manager`, frontend, `id: kong-service-manager`. Exports `KongServiceManagerContent` (the entity tab), the `kongServiceManagerApiRef` with its `KongServiceManagerClient`, and `useEntityAnnotations`. Manages Kong services, routes and plugins for a catalog entity.
- `plugins/kong-service-manager-backend` — `@veecode-platform/backstage-plugin-kong-service-manager-backend`, backend, `pluginId: kong-service-manager-backend`, so its API path is `/api/kong-service-manager-backend/`. Talks to the Kong Admin API and owns the promote-to-code feature.
- `plugins/kong-service-manager-common` — `@veecode-platform/backstage-plugin-kong-service-manager-common`, shared types and the permission set: read permissions for services, plugins, routes and instances; apply, update and disable for service plugins; create, update and delete for routes; and `kong.plugin.promote`.
- `plugins/scaffolder-backend-module-kong` — `@veecode-platform/plugin-scaffolder-backend-module-kong`, a module for the `scaffolder` plugin providing the decK actions `deckGenerate`, `deckSync` and `deckPing`.
- `plugins/scaffolder-field-extensions-kong` — `@veecode-platform/backstage-plugin-scaffolder-field-extensions-kong`, frontend, providing `KongInstancePicker` for scaffolder templates.

## Layout

```pre
workspaces/kong-tools/
├── packages/app, packages/backend         # Hosting app
├── plugins/
│   ├── kong-service-manager/              # Frontend
│   │   ├── src/muiClassNameSetup.ts       # MUI v5 class-name prefixing
│   │   ├── src/api/, src/hooks/
│   │   ├── dev/index.tsx
│   │   └── e2e-tests/permissions.test.ts
│   ├── kong-service-manager-backend/
│   │   ├── config.d.ts                    # kong.promotion
│   │   ├── migrations/                    # 20260914010000_init_promotions.js
│   │   ├── dev/index.ts
│   │   └── src/services/
│   │       ├── KongServiceManagerService.ts   # Instances, defaultTags, Admin API
│   │       ├── GitlabClient.ts                # Merge-request mechanics
│   │       ├── promotionStore.ts, promotionFinalizer.ts, promotionTags.ts
│   │       ├── mrDetail.ts, renderCheck.ts
│   │       ├── adapters/                      # Per-plugin-type file edits
│   │       └── __fixtures__/golden-path-repo/ # Helm chart used by the tests
│   ├── kong-service-manager-common/
│   ├── scaffolder-backend-module-kong/src/actions/
│   └── scaffolder-field-extensions-kong/src/components/KongInstancePicker/
├── docs/
│   ├── applying-changes-to-kong.md        # Consumer deployment guide
│   └── screenshots/
├── scripts/start-kong.sh, stop-kong.sh    # Local Kong through vkdr
├── docker-compose.yaml                    # Container harness
├── backstage.json                         # 1.52.0
├── DECISIONS.md                           # PDR-001..015
├── README.md, AGENTS.md, CLAUDE.md
└── Makefile
```

## Commands

The standard `yarn` and `make` targets described in the root `AGENTS.md`, plus:

| Command | Purpose |
|---------|---------|
| `scripts/start-kong.sh` | Bring up local infrastructure with `vkdr`, install Kong with the default ingress controller, and apply the sample API from `examples/k8s/` |
| `scripts/stop-kong.sh` | Tear that down |

The repository-root `.claude/commands/start-kong.md` and `stop-kong.md` wrap those two scripts.

## Architecture

- **Instances come from configuration.** `KongServiceManagerService` reads `kong.instances` as a config array; each entry carries an id, an Admin API base URL, an optional workspace and an optional `defaultTags` list. Every write unions the instance's `defaultTags` with the tags for that object, so portal-created entities stay identifiable in a shared gateway. `scaffolder-backend-module-kong` reads the same `kong.instances` array in `src/actions/kongConfig.ts`.
- **Promote-to-code**, off unless `kong.promotion.enabled` is true. A plugin enabled from the portal on a route can be promoted into the service's Git repository: adapters turn the live plugin config into file edits on the golden-path Helm chart, `GitlabClient` opens a merge request, and the route is frozen while the promotion is open. `promotionFinalizer` advances each record at most one state per tick through `draft`, `mr-open`, `awaiting-deploy`, `applying` and `codified`; `renderCheck` compares the rendered manifest with the live plugin before the experimental copy is removed. If the merged deploy does not converge within `applyTimeoutMinutes`, the finalizer restores the experimental plugin and marks the record `failed-restored`. Discarding closes the merge request and untags the plugin. There is no frontend for this yet.
- **MUI v5 class names.** `configureMuiClassNames()` is called at module scope in the frontend `plugin.ts` and imports the generator through the `@mui/material` barrel, because module federation shares the barrel; a deep import would configure a different instance and do nothing. It must stay a call in the used module graph, since the package sets `sideEffects: false` and a side-effect-only import would be tree-shaken out of the dynamic bundle.

## Testing

24 test files. The backend carries the weight: `router.test.ts`, `router.permissions.test.ts` and `router.promotion.test.ts` for the HTTP surface, plus service suites for `KongServiceManagerService`, `promotionStore`, `promotionFinalizer`, `GitlabClient` and both `renderCheck` cases. The scaffolder module tests each decK action, and `KongInstancePicker` has a component test. `plugins/kong-service-manager/e2e-tests/permissions.test.ts` covers the permission behaviour end to end.

The promotion tests render against `src/services/__fixtures__/golden-path-repo/`, a small Helm chart. Change the fixture and the render checks change with it.

## Dynamic loading

`docker-compose.yaml` at the workspace root runs `veecode/devportal:latest` and mounts three `dist-dynamic/` folders under `/app/dynamic-plugins/dist/`: the frontend, the backend and the scaffolder field extensions. The scaffolder backend module has no export script and is not part of that loop.

```sh
make build-dynamic
docker compose up
```

## Mocks and external dependencies

- **Kong** through its Admin API, and **GitLab** for promotion merge requests. Neither is mocked as a running service; tests stub the clients.
- `scripts/start-kong.sh` gives you a real local Kong through `vkdr`, which is the practical way to exercise the plugin.
- Both plugins have `dev/` entry points for standalone runs.

## Gotchas

- The backend `pluginId` is `kong-service-manager-backend`, while the frontend and the common package use `kong-service-manager`. The API path and the `getBaseUrl` argument follow the backend id.
- The Makefile's `VERSION` default and the versions in the plugin `package.json` files do not agree. Pass `VERSION=` explicitly to `publish`, `unpublish` and `get-version`, or fix the default first.
- Promotion writes to a customer's Git repository and removes plugins from a gateway. It is off by default; keep it that way unless the deployment has been configured for it.
- Do not "simplify" `muiClassNameSetup.ts` into a side-effect import or a deep MUI import. Both variants have been tried and are inert; the file header records why.
- This workspace is on Backstage 1.52.0, ahead of the reference workspace. Do not assume dummy's pins match.

## Decisions

Design decisions for these plugins live in [`DECISIONS.md`](DECISIONS.md) as plugin decision records `PDR-001` to `PDR-015`, cited elsewhere as `kong-tools PDR-NNN`. New entries start at `PDR-016`. They are never called ADRs.

`PDR-016` is the one to read before changing how the plugin writes to Kong: two write paths, no default, and a tag convention so an automated sync leaves portal-created entities alone. [`docs/applying-changes-to-kong.md`](docs/applying-changes-to-kong.md) is its consumer-facing explanation.

Cross-workspace decisions are `plugins ADR-NNNN` in the planning repository `veecode-platform/devportal-plugins-parent`.
