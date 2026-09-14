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
- `gitlab.pipeline.trigger` — create a pipeline and retry a pipeline.
- `gitlab.pipeline.play` — play a manual job with variables, and retry a job.
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

## Lifecycle reconciler

The backend can optionally track "teardown" operations. When a user plays a
manual job whose name matches the configured teardown job through this
plugin, the backend records a persistent operation and a scheduled
reconciler later deletes the catalog descriptor file from the project's
default branch, once it confirms the teardown job actually succeeded and was
not superseded by a later deploy. This lets a discovery-based catalog drop
the entity on its next scan.

The feature is off by default. Enable it with:

```yaml
gitlabPipelines:
  lifecycle:
    enabled: false            # default false — feature fully off unless enabled
    teardownJobName: destroy  # job name that marks a teardown
    catalogFile: catalog-info.yaml
    deployJobName: deploy     # used for the supersede check
    reconcileIntervalSeconds: 60
```

Guardrails before the catalog file is deleted: the teardown job's pipeline
ref must be the project's default branch, and there must be no later
successful run of `deployJobName` after the teardown job finished. Either
guardrail failing marks the operation `superseded` or `failed` instead of
deleting anything. A `GET .../teardowns` endpoint (same entity-anchored
prefix, `gitlab.pipeline.read` permission) lists the recorded operations.

The CI/CD tab (`GitlabPipelineList`) surfaces these operations in a
"Teardown Operations" card below the pipelines table: state (pending,
failed, superseded, consumed, flagged, each with its own icon and label),
who requested the teardown, when, and the short unregister commit sha once
an operation is `consumed`. The card renders nothing when the entity has no
teardown operations, which is also what the endpoint returns while the
feature is disabled.

## Dynamic V3 loop

The `dynamic/` directory is a local smoke harness for
`veecode/devportal:3.0.0-beta.7`. It mounts the two locally exported
`dist-dynamic/` folders into the V3 image, installs them into the named
dynamic-plugin volume, starts PostgreSQL and the portal, and configures the
frontend cards. The complete loop is:

```sh
cd workspaces/gitlab-pipelines
make build-dynamic
cd dynamic
GITLAB_HOST=gitlab.example.com GITLAB_TOKEN=dummy docker compose up -d
curl -sS http://localhost:7007/api/scalprum/plugins
docker compose down -v
```

If the checkout and Docker daemon are on another build host, run the same
commands there through SSH, replacing the placeholders with that host and its
checkout path:

```sh
ssh <build-host> 'cd <workspace-path>/workspaces/gitlab-pipelines && make build-dynamic'
ssh <build-host> 'cd <workspace-path>/workspaces/gitlab-pipelines/dynamic && GITLAB_HOST=gitlab.example.com GITLAB_TOKEN=dummy docker compose up -d'
ssh <build-host> 'curl -sS http://localhost:7007/api/scalprum/plugins'
ssh <build-host> 'cd <workspace-path>/workspaces/gitlab-pipelines/dynamic && docker compose down -v'
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
