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

From a plugin workspace, `yarn dev:dynamic` runs the type build, exports each
workspace plugin with the Red Hat Developer Hub CLI in `--dev` mode into
`$DEVPORTAL_LOCAL_DIR/dynamic-plugins-src-dev` (beside the runner's plugin root, never
inside it), carries the workspace's `dynamic-plugins.yaml` entries into a generated
local operator config under `dynamic-plugins-root-dev/`, and prints the exact
`docker compose -f ... -f ... -f ... up -d` command to run in `devportal-local`. It
does not start the portal, and no tracked runner config is edited.

The CLI version defaults to 1.11.2, the `cli` value in `versions.json` of
`devportal-plugin-export-overlays`, so the export is built the way the published
artifact is. Set `RHDH_CLI_VERSION` to export with another version. Do not use
`latest`: a CLI release can change the frontend export format, and the runner then
serves no dynamic frontend.

When the runner image already ships the plugin being proven, the generated config
disables that image's entry with its exact ref and `disabled: true`, the override
described in `devportal-chart` `docs/product-face-overrides.md`, so the export is the
only copy loaded. The script matches entries by plugin identity, so there is no list
to maintain.

On DevPortal 3.1 the script reads `/opt/app-root/src/factory-plugins.yaml` from the
runner image (`DEVPORTAL_IMAGE`, else the `devportal-local` compose default). It takes
each factory plugin's reference from the catalog index's `dynamic-plugins.default.yaml`,
extracted from the image named by `CATALOG_INDEX_IMAGE` in that compose file, and
disables it in the `oci://…@sha256:…!<path>` form. The compose override that mounts
the export sits beside the operator file in `dynamic-plugins-root-dev/`. On 3.0.x,
where the factory list is missing, the script reads
`/opt/app-root/src/dynamic-plugins.veecode.yaml` instead. It stops when it can read
neither file.
