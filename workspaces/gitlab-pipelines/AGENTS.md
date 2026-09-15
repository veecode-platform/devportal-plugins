# AGENTS.md — gitlab-pipelines workspace

Agent context for this workspace. Repository-wide rules are in the root [`AGENTS.md`](../../AGENTS.md); the section order follows [`workspaces/dummy/AGENTS.md`](../dummy/AGENTS.md).

## What the plugins do

GitLab pipelines and jobs for catalog entities, with the GitLab token held by the backend and every request anchored to an entity.

- `plugins/gitlab-pipelines` — `@veecode-platform/backstage-plugin-gitlab-pipelines`, frontend, `pluginId: gitlab-pipelines`. The CI/CD tab (`GitlabPipelinesList`) lists pipelines and their jobs, triggers and cancels pipelines, plays and retries manual jobs, and renders a "Teardown Operations" card when the entity has recorded teardown operations.
- `plugins/gitlab-pipelines-backend` — `@veecode-platform/backstage-plugin-gitlab-pipelines-backend`, backend, `pluginId: gitlab-pipelines`. Serves the entity-anchored routes under `/api/gitlab-pipelines/`, talks to GitLab through `src/service/GitlabApi.ts`, and runs the optional lifecycle reconciler.
- `plugins/gitlab-pipelines-common` — `@veecode-platform/gitlab-pipelines-common`, shared types and the permission definitions used by both sides.

## Layout

```pre
workspaces/gitlab-pipelines/
├── packages/app, packages/backend    # Hosting app
├── plugins/
│   ├── gitlab-pipelines/             # Frontend
│   │   └── src/
│   │       ├── api/GitlabPipelinesClient.ts
│   │       └── components/GitlabPipelinesList/
│   │           ├── PipelineJobs/
│   │           └── TeardownOperations/
│   ├── gitlab-pipelines-backend/
│   │   ├── config.d.ts               # gitlabPipelines.lifecycle
│   │   ├── migrations/               # 20260914000000_init_teardown_operations.js
│   │   └── src/
│   │       ├── router.ts             # Entity-anchored routes
│   │       ├── auth/authorize.ts     # Permission checks
│   │       ├── entity/resolveEntity.ts
│   │       ├── validation/schemas.ts
│   │       └── service/
│   │           ├── GitlabApi.ts
│   │           ├── teardownStore.ts
│   │           └── lifecycleReconciler.ts
│   └── gitlab-pipelines-common/
├── dynamic/                          # Container harness (see Dynamic loading)
├── backstage.json                    # 1.49.2
├── Makefile
├── README.md                         # For humans; security model and the V3 loop
├── AGENTS.md                         # This file
└── CLAUDE.md
```

## Commands

The standard `yarn` and `make` targets described in the root `AGENTS.md`. `dynamic/run-dynamic.sh` brings up the container harness. There are no `dev/` entry points in the plugins: run the hosting app with `yarn start`.

## Architecture

- **The token never reaches the browser.** The backend reads the GitLab integration from the hosting app's configuration and calls GitLab itself; the frontend only ever talks to `/api/gitlab-pipelines/`.
- **Every route is entity-anchored.** Requests carry the entity they act on, `src/entity/resolveEntity.ts` resolves it, and `src/auth/authorize.ts` checks the caller's permission against that entity before anything reaches GitLab. Routes: `GET` branches, pipelines, one pipeline, its jobs and `teardowns`; `POST` pipelines, pipeline retry and cancel, job play, retry and cancel.
- **Request bodies are validated** in `src/validation/schemas.ts` before use.
- **Lifecycle reconciler** (`src/service/lifecycleReconciler.ts`), off unless `gitlabPipelines.lifecycle.enabled` is true. When a user plays a manual job whose name matches `teardownJobName` through this plugin, the backend records a persistent operation in the table created by the migration. On a schedule (`reconcileIntervalSeconds`) the reconciler re-checks pending operations and deletes `catalogFile` from the project's default branch once it confirms the teardown job succeeded and was not superseded. Guardrails: the teardown job's pipeline ref must be the default branch, and there must be no later successful run of `deployJobName` after it finished. A failing guardrail marks the operation `superseded` or `failed` instead of deleting anything. Operation states surfaced in the UI are pending, failed, superseded, consumed and flagged.

## Testing

```pre
plugins/gitlab-pipelines-backend/src/router.test.ts
plugins/gitlab-pipelines-backend/src/router.teardownCapture.test.ts
plugins/gitlab-pipelines-backend/src/auth/authorize.test.ts
plugins/gitlab-pipelines-backend/src/entity/resolveEntity.test.ts
plugins/gitlab-pipelines-backend/src/validation/schemas.test.ts
plugins/gitlab-pipelines-backend/src/service/GitlabApi.test.ts
plugins/gitlab-pipelines-backend/src/service/lifecycleReconciler.test.ts
plugins/gitlab-pipelines-common/src/permissions.test.ts
plugins/gitlab-pipelines/src/plugin.test.ts
plugins/gitlab-pipelines/src/api/GitlabPipelinesClient.test.ts
plugins/gitlab-pipelines/src/components/GitlabPipelinesList/PipelineJobs/PipelineJobs.test.tsx
plugins/gitlab-pipelines/src/components/GitlabPipelinesList/TeardownOperations/TeardownOperations.test.tsx
packages/app/src/App.test.tsx
packages/app/e2e-tests/app.test.ts
```

Authorization, entity resolution and the reconciler each have their own suite; keep it that way when changing them, because the guardrails are the security boundary. Run with `yarn test:all` or `yarn test --watchAll=false` inside a plugin.

## Dynamic loading

The harness is the `dynamic/` folder, not a compose file at the workspace root. It runs `veecode/devportal:3.0.0-beta.7` alongside `postgres:16`, and mounts the two `dist-dynamic/` folders under `/opt/app-root/src/local-plugins/`, which is the 3.x installer layout rather than the 2.x `/app/dynamic-plugins/dist/` one. `dynamic/catalog/` holds entities for the loop and `dynamic/app-config.yaml` its configuration.

```sh
make build-dynamic
cd dynamic && ./run-dynamic.sh
```

## Mocks and external dependencies

GitLab is the external dependency, reached only from the backend. A database is required once the lifecycle feature is enabled, which is why the harness starts PostgreSQL. There are no mock clients in the plugins: tests stub `GitlabApi` and the stores directly.

## Gotchas

- Frontend and backend share `pluginId: gitlab-pipelines`, so the API path is `/api/gitlab-pipelines/` and `discoveryApi.getBaseUrl('gitlab-pipelines')` is what the client resolves.
- The lifecycle feature deletes a file from a default branch. It is off by default, and both guardrails must stay in place; the read endpoint returns nothing while it is disabled.
- `plugins/gitlab-pipelines-common/src/permissions.test.ts` describes the permissions as coming from "ADR-009". That document exists only as a draft in the separate `devportal-planning` repository, and the number collides with a different accepted ADR there. It is a known dangling citation tracked in the planning repository's ghost register; leave the text as written until that is resolved.
- `backstage.json` pins 1.49.2 while the DevPortal host declares 1.52.0. Moving to the host line is a planned milestone; do not bump ad hoc.
- The common package's name drops the `backstage-plugin-` prefix that other workspaces keep.

## Decisions

This workspace keeps no `DECISIONS.md`. If one is added, entries are plugin decision records numbered `PDR-001`, `PDR-002`, … and cited as `gitlab-pipelines PDR-NNN`, never as ADRs. Cross-workspace decisions are `plugins ADR-NNNN` in the planning repository `veecode-platform/devportal-plugins-parent`.
