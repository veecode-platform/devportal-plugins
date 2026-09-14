# AGENTS.md — github-workflows workspace

Agent context for this workspace. Repository-wide rules are in the root [`AGENTS.md`](../../AGENTS.md); the section order follows the template in [`workspaces/dummy/AGENTS.md`](../dummy/AGENTS.md).

## What the plugins do

Backstage plugins for viewing, triggering and monitoring GitHub Actions workflows from the catalog, for entities annotated with `github.com/project-slug`.

- `plugins/github-workflows` — `@veecode-platform/backstage-plugin-github-workflows`, frontend, `id: 'github-workflows'`. Exports `EntityGithubWorkflowsContent` (full tab: workflow table, run details, job steps, log viewer, branch selection, dispatch with input parameters) and `EntityGithubWorkflowsCard` (overview card with status summary and start/stop actions). The pre-v2 exports `GithubWorkflowsContent`, `GithubWorkflowsOverviewContent` and `GithubWorkflowsTabContent` are still exported, deprecated; [`plugins/github-workflows/MIGRATION.md`](plugins/github-workflows/MIGRATION.md) is the consumer guide.
- `plugins/github-workflow-backend` — `@veecode-platform/backstage-plugin-github-workflows-backend`, backend, `pluginId: 'github-workflow-backend'`. REST API that proxies GitHub Actions through Backstage's `ScmIntegrations` and `DefaultGithubCredentialsProvider` (GitHub Apps and PATs). Endpoints: list workflows, branches, default branch, start/stop runs, list jobs, run details, download logs, list environments. The service is injectable through `githubWorkflowsServiceRef`.
- `plugins/github-workflows-common` — `@veecode-platform/github-workflows-common`, shared types (`Workflows`, `Branch`, `JobsResponse`, `WorkflowRun`, `EnvironmentsResponse`, …), the `GithubWorkflowsApi` interface and `githubWorkflowsApiRef`. Used by both plugins.

## Layout

Standard shape (see the root `AGENTS.md`), plus:

```pre
workspaces/github-workflows/
├── plugins/
│   ├── github-workflows/                # frontend; README.md and MIGRATION.md are consumer docs
│   │   ├── src/api/MockGithubWorkflowsClient.ts
│   │   └── dev/index.tsx
│   ├── github-workflow-backend/         # backend (directory and pluginId are singular "workflow")
│   │   ├── src/services/MockGithubWorkflowsService.ts
│   │   ├── src/services/mockServiceFactory.ts
│   │   └── dev/index.ts
│   └── github-workflows-common/
├── dynamic/                             # Container harness: docker-compose.yaml, dynamic-plugins.yaml, app-config.yaml, run-dynamic.sh
├── backstage.json                       # 1.49.2
├── Makefile                             # standard targets + replace-workspace / restore-workspace
├── README.md
├── AGENTS.md                            # this file
└── CLAUDE.md
```

## Commands

Standard `yarn` and `make` targets (root `AGENTS.md`). Specific to this workspace:

| Command | Purpose |
|---------|---------|
| `make replace-workspace` | Rewrite `"@veecode-platform/github-workflows-common": "workspace:*"` in the frontend and backend `package.json` to `^VERSION` |
| `make restore-workspace` | Put `workspace:*` back after publishing |
| `make publish` / `make publish-dynamic` | Both run `replace-workspace` first; they do not run `restore-workspace` |
| `dynamic/run-dynamic.sh` | `docker-compose up` on `dynamic/docker-compose.yaml` |

## Architecture

- Frontend components read data through `githubWorkflowsApiRef` (interface in `-common`); the real client calls the backend, the mock client returns canned data.
- The backend registers `githubWorkflowsServiceRef` and resolves it through dependency injection, so tests and the `dev/` entry point substitute `MockGithubWorkflowsService` without touching the router.
- GitHub credentials come from the hosting app's `integrations.github` configuration via `ScmIntegrations` and `DefaultGithubCredentialsProvider`; the plugin holds no token of its own.
- The frontend uses the legacy frontend system; the New Frontend System is not supported yet (stated in the plugin README).

## Testing

```pre
plugins/github-workflows/src/plugin.test.ts
plugins/github-workflow-backend/src/plugin.test.ts     # startTestBackend
plugins/github-workflow-backend/src/router.test.ts     # router with MockGithubWorkflowsService
packages/app/src/App.test.tsx
packages/app/e2e-tests/app.test.ts                     # Playwright
```

Run with `yarn test:all` from the workspace or `yarn test --watchAll=false` from a plugin. Frontend component tests are thinner than dummy's; add them next to the component when touching one.

## Dynamic loading

`dynamic/docker-compose.yaml` starts `veecode/devportal:1.2.0` and mounts `dynamic/dynamic-plugins.yaml`, `dynamic/app-config.yaml` and the two `dist-dynamic/` folders under `/app/dynamic-plugins/dist/veecode-platform-backstage-plugin-github-workflows{,-backend}-dynamic`. Build first (`make build-dynamic`), then `dynamic/run-dynamic.sh`. The commented-out lines in the script show an older flow that pulled published versions by integrity hash.

## Mocks and external dependencies

- External dependency: GitHub (REST API through Backstage's integrations). Needed only for real data.
- `MockGithubWorkflowsService` (backend) and `MockGithubWorkflowsClient` (frontend) let `yarn start` and the `dev/` entry points run without credentials.

## Gotchas

- Naming is inconsistent on purpose and must stay that way for compatibility: directory `github-workflow-backend` and `pluginId: 'github-workflow-backend'` are singular, the frontend and the npm package names are plural.
- `make publish` leaves `^VERSION` in the two `package.json` files. Run `make restore-workspace` before committing, or the workspace link is lost.
- The deprecated exports are part of the public API. Removing them is a major version.
- The `dynamic/` harness runs a 1.2.0 image, not the current DevPortal line; it proves loading, not parity with production.

## Decisions

No `DECISIONS.md` in this workspace. If one is added, entries are plugin decision records (`PDR-NNN`), cited as `github-workflows PDR-NNN`.
