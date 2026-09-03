# V3 dynamic smoke loop

This harness loads the GitLab Pipelines frontend and backend bundles from local
`dist-dynamic/` directories into `veecode/devportal:3.0.0-beta.7`. It is a
development and packaging check, not a production deployment.

## Run

From the repository root, export both plugins on the build host first:

```sh
cd workspaces/gitlab-pipelines
make build-dynamic
cd dynamic
GITLAB_HOST=gitlab.example.com GITLAB_TOKEN=dummy docker compose up -d
```

The `dist-dynamic/` folders are ignored by Git and are mounted directly into
the installer. The backend export also installs its private dependencies so
the V3 installer's local `npm pack` step can bundle them. If the checkout and
Docker daemon are on another build host, run the equivalent commands there:

```sh
ssh <build-host> 'cd <workspace-path>/workspaces/gitlab-pipelines && make build-dynamic'
ssh <build-host> 'cd <workspace-path>/workspaces/gitlab-pipelines/dynamic && GITLAB_HOST=gitlab.example.com GITLAB_TOKEN=dummy docker compose up -d'
```

For a loading-only smoke, use placeholder values:

```sh
curl -sS http://localhost:7007/api/scalprum/plugins
```

The portal will be available at `http://localhost:7007`. The installer must
finish with `All plugins installed successfully`; the backend must initialize
the `gitlab-pipelines` plugin and the Scalprum endpoint must list the GitLab
Pipelines frontend. The placeholder values intentionally do not exercise live
GitLab API calls.

To stop the stack and remove its database and dynamic-plugin volume:

```sh
docker compose down -v
```

When running on another build host, prefix these commands with `ssh
<build-host>` and use the checkout path on that host.

## Files

- `docker-compose.yaml` runs PostgreSQL, the V3 dynamic-plugin installer, and
  the portal using the V3 image paths under `/opt/app-root/src`. The
  `fix-volume-ownership` init service prepares the named volume for UID 1001,
  and the catalog directory is mounted for the sample Resource.
- `dynamic-plugins.yaml` enables both local packages and mounts the pipeline
  and jobs cards.
- `app-config.yaml` enables guest authentication, the environment-provided
  GitLab integration, PostgreSQL, and the loading-only catalog configuration.
- `catalog/sample.yaml` is an owned Resource with the GitLab project
  annotation required by the backend.
