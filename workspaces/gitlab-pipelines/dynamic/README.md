# V3 dynamic smoke loop

This harness loads the GitLab Pipelines frontend and backend bundles from local
`dist-dynamic/` directories into `veecode/devportal:3.0.0-beta.7`. It is a
development and packaging check, not a production deployment.

## Run

From this directory, export both plugins on the remote build host first:

```sh
cd ..
/tmp/claude-1000/-home-gio-workspace/256dd8ed-a0f2-427d-9790-463db8f04f6f/scratchpad/atlas-run.sh 'make build-dynamic'
/tmp/claude-1000/-home-gio-workspace/256dd8ed-a0f2-427d-9790-463db8f04f6f/scratchpad/atlas-pull.sh workspaces/gitlab-pipelines
rsync -az --no-group plugins/gitlab-pipelines/dist-dynamic/ atlas-worker:work/devportal-plugins-wt/workspaces/gitlab-pipelines/plugins/gitlab-pipelines/dist-dynamic/
rsync -az --no-group plugins/gitlab-pipelines-backend/dist-dynamic/ atlas-worker:work/devportal-plugins-wt/workspaces/gitlab-pipelines/plugins/gitlab-pipelines-backend/dist-dynamic/
cd dynamic
```

The remote build is required for this repository. The pulled `dist-dynamic/`
folders are ignored by Git and are mounted directly into the installer. The
backend export also installs its private dependencies so the V3 installer's
local `npm pack` step can bundle them.

For a loading-only smoke, use placeholder values:

```sh
ssh atlas-worker 'cd ~/work/devportal-plugins-wt/workspaces/gitlab-pipelines/dynamic && GITLAB_HOST=gitlab.example.com GITLAB_TOKEN=dummy ./run-dynamic.sh'
```

The portal will be available at `http://localhost:7007`. The installer must
finish with `All plugins installed successfully`; the backend must initialize
the `gitlab-pipelines` plugin and the Scalprum endpoint must list the GitLab
Pipelines frontend. The placeholder values intentionally do not exercise live
GitLab API calls.

To stop the stack and remove its database and dynamic-plugin volume:

```sh
ssh atlas-worker 'cd ~/work/devportal-plugins-wt/workspaces/gitlab-pipelines/dynamic && docker compose down -v'
```

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
