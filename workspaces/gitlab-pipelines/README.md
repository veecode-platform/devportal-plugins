# GitLab Pipelines Workspace

This workspace contains the GitLab Pipelines frontend, backend, and common
packages, plus a hosting app for development and testing.

The plugin displays a catalog entity's GitLab pipelines and jobs, and exposes
the supported pipeline and job actions: trigger, play manual jobs, retry, and
cancel. The backend resolves the GitLab host and project from the catalog
entity instead of accepting an arbitrary project from the browser.

## Security and authorization

The backend requires user credentials, resolves the requested catalog entity,
checks the resource-scoped permission, and then checks ownership. The four
permissions are:

- `gitlab.pipeline.read` — list branches, pipelines, and jobs.
- `gitlab.pipeline.trigger` — create a pipeline and retry a pipeline or job.
- `gitlab.pipeline.play` — play a manual job with variables.
- `gitlab.pipeline.cancel` — cancel a pipeline or job.

An RBAC CSV policy can grant all four permissions to a developer role:

```csv
p, role:default/developer, gitlab.pipeline.read, read, allow
p, role:default/developer, gitlab.pipeline.trigger, create, allow
p, role:default/developer, gitlab.pipeline.play, update, allow
p, role:default/developer, gitlab.pipeline.cancel, delete, allow
```

The `integrations.gitlab` token must have the `api` scope. Use a GitLab group
or project access token owned by an account with Maintainer access to the
target project. The plugin never uses the signed-in user's GitLab token; all
GitLab API calls use the configured integration token from the backend.

The catalog entity must carry `gitlab.com/project-slug` and a source-location
annotation from which the GitLab host can be resolved. Its `spec.owner` must
match the signed-in user's ownership entity refs, either the user itself or a
group it belongs to. The backend enforces this rule for every operation.

## Dynamic V3 loop

The `dynamic/` directory is a local smoke harness for
`veecode/devportal:3.0.0-beta.7`. It mounts the two locally exported
`dist-dynamic/` folders into the V3 image, installs them into the named
dynamic-plugin volume, starts PostgreSQL and the portal, and configures the
frontend cards. The complete loop is:

```sh
cd workspaces/gitlab-pipelines
/tmp/claude-1000/-home-gio-workspace/256dd8ed-a0f2-427d-9790-463db8f04f6f/scratchpad/atlas-run.sh 'make build-dynamic'
/tmp/claude-1000/-home-gio-workspace/256dd8ed-a0f2-427d-9790-463db8f04f6f/scratchpad/atlas-pull.sh workspaces/gitlab-pipelines
rsync -az --no-group plugins/gitlab-pipelines/dist-dynamic/ atlas-worker:work/devportal-plugins-wt/workspaces/gitlab-pipelines/plugins/gitlab-pipelines/dist-dynamic/
rsync -az --no-group plugins/gitlab-pipelines-backend/dist-dynamic/ atlas-worker:work/devportal-plugins-wt/workspaces/gitlab-pipelines/plugins/gitlab-pipelines-backend/dist-dynamic/
ssh atlas-worker 'cd ~/work/devportal-plugins-wt/workspaces/gitlab-pipelines/dynamic && GITLAB_HOST=gitlab.example.com GITLAB_TOKEN=dummy ./run-dynamic.sh'
ssh atlas-worker 'curl -s http://localhost:7007/api/scalprum/plugins'
ssh atlas-worker 'cd ~/work/devportal-plugins-wt/workspaces/gitlab-pipelines/dynamic && docker compose down -v'
```

The first smoke only proves that both dynamic plugins load; it deliberately
does not make a live GitLab call. Replace the placeholder environment values
with a test host and token when exercising pipeline data and actions. See
[`dynamic/README.md`](dynamic/README.md) for the harness details.

## Development

Run the workspace checks from this directory:

```sh
yarn install
yarn tsc
```

Build and export dynamic plugins with:

```sh
make build-dynamic
```

The backend export embeds the private common package and installs the private
runtime dependencies so the V3 installer can bundle them with its local
`npm pack` step; the common package does not need to be published to the
public registry.
