# GitHub Workflows Workspace

This workspace contains Backstage plugins for viewing, triggering, and monitoring GitHub Actions workflows directly from the Backstage catalog.

## Plugins

### `github-workflows` (frontend)

Entity page extensions that display GitHub Actions data for catalog entities annotated with `github.com/project-slug`.

- **EntityGithubWorkflowsContent** — Full tab with workflow table, run details, job steps, and log viewer. Supports branch selection and workflow dispatch with input parameters.
- **EntityGithubWorkflowsCard** — Overview card showing workflow status summary.

### `github-workflow-backend` (backend)

REST API that proxies GitHub Actions endpoints through Backstage's `ScmIntegrations` and `DefaultGithubCredentialsProvider`. Supports both GitHub Apps and PATs.

Endpoints: list workflows, branches, default branch, start/stop workflow runs, list jobs, get run details, download logs, list environments.

The service is injectable via `githubWorkflowsServiceRef` — the plugin resolves it through DI, allowing mock substitution for dev and testing.

### `github-workflows-common` (shared library)

Shared TypeScript types (`Workflows`, `Branch`, `JobsResponse`, `WorkflowRun`, `EnvironmentsResponse`, etc.) and the `GithubWorkflowsApi` interface with its `githubWorkflowsApiRef`. Used by both frontend and backend.

## Development

Both plugins include mock implementations (`MockGithubWorkflowsService`, `MockGithubWorkflowsClient`) so `yarn start` works without GitHub credentials. The `dev/` entry points wire these mocks automatically.
