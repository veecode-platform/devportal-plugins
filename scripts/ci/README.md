# CI scripts

`list-workspaces-with-changes.js` prints a JSON array for workspaces touched by a
base/head diff. Changes under `scripts/ci/` or `.github/workflows/ci.yml` select every
workspace. With `GITHUB_OUTPUT`, it also writes the `workspaces` output used by the workflow.

`check-backstage-version.js` compares every workspace's `backstage.json` with the
DevPortal host's `backstage.json`. Set `HOST_BACKSTAGE_VERSION` for an offline run;
`--strict` returns 1 unless every workspace is `ok` (behind, ahead, missing or host
unavailable all fail closed). The default report mode returns 0.

`check-dynamic-plugin-config.js` validates each `pluginConfig` in a workspace's
`dynamic-plugins.yaml` against the schemas reachable from its exported product package.
It follows runtime dependencies only, so dev-shell packages and their schemas are not
inputs. Host-owned `app` and `backend` roots are removed before validating the plugin
subtree. The check reports the package, property path, schema file, and dynamic config
file; it is invoked after the workspace install and remains report-mode in CI.

Run locally from the repository root:

```sh
node scripts/ci/list-workspaces-with-changes.js main HEAD
node scripts/ci/check-backstage-version.js
HOST_BACKSTAGE_VERSION=1.52.0 node scripts/ci/check-backstage-version.js
node scripts/ci/check-dynamic-plugin-config.js aws-cost-insights
```

CI gates are intentionally in report mode in this stage. Their contract is governed by
[ADR-0011](../../docs/adr/0011-ci-gates-are-the-standards-versioning-by-changesets.md).
