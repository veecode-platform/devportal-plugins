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

`check-product-independence.js` runs from a workspace root after `yarn install`.
It runs the installed ESLint against what each product package ships from source
(`src/` plus any other source `npm pack --dry-run` lists, such as `migrations/` or
`config.d.ts`) with the Backstage ESLint factory, reads JSON output, and reports only
`@backstage/no-undeclared-imports` and `@backstage/no-relative-monorepo-imports`
findings, plus imports of a `packages/` package by name with a literal specifier in any
form (static or dynamic import, re-export, `require`, `require.resolve`), which it
restricts with `no-restricted-syntax` because `no-undeclared-imports` skips a package
Node cannot resolve. A specifier computed at runtime, such as `import(name)`, cannot be
checked statically. It also scans product package
metadata (`backstage.pluginPackages`, `scalprum.exposedModules`, `files`) for references
into `packages/`. It returns 1 when either check finds a reference. CI records the
result in report mode.

Run locally from the repository root:

```sh
node scripts/ci/list-workspaces-with-changes.js main HEAD
node scripts/ci/check-backstage-version.js
HOST_BACKSTAGE_VERSION=1.52.0 node scripts/ci/check-backstage-version.js
node scripts/ci/check-dynamic-plugin-config.js aws-cost-insights
```

CI gates are intentionally in report mode in this stage. Their contract is governed by
[ADR-0011](../../docs/adr/0011-ci-gates-are-the-standards-versioning-by-changesets.md).
