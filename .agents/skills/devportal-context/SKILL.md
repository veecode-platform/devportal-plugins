---
name: devportal-context
description: Resolve the devportal-local checkout used by local dynamic-plugin proof 2.
---

# DevPortal context

Proof 2 runs in the real `devportal-local` runner. Use the helper in this skill to
resolve that checkout before exporting a plugin:

```bash
DEVPORTAL_LOCAL_DIR="$(bash .agents/skills/devportal-context/scripts/resolve-devportal-local-dir.sh)"
```

The resolver uses `DEVPORTAL_LOCAL_DIR` when it is set. Otherwise it searches the
nearby agent workspace for a checkout containing both `.chart-pin` and
`docker-compose.yml`. It fails if the configured checkout is invalid or if the
search finds zero or multiple candidates; it never guesses a path.

If the runner is not found, tell the user to clone `devportal-local` and set
`DEVPORTAL_LOCAL_DIR` to that checkout. Do not invent or silently select another
directory.

From a plugin workspace, `yarn dev:dynamic` exports each workspace plugin with the
Red Hat Developer Hub CLI in `--dev` mode into
`$DEVPORTAL_LOCAL_DIR/dynamic-plugins-root-dev`, carries the workspace's
`dynamic-plugins.yaml` entries into a generated local operator config, and prints
the exact `docker compose -f ... -f ... -f ... up -d` command to run in
`devportal-local` with `docker-compose.dynamic-plugins-root.yml`. It does not start
Docker. The generated files live under the ignored
`dynamic-plugins-root-dev/` directory; no tracked runner config is edited.
