# CI scripts

`list-workspaces-with-changes.js` prints a JSON array for workspaces touched by a
base/head diff. Changes under `scripts/ci/` or `.github/workflows/ci.yml` select every
workspace. With `GITHUB_OUTPUT`, it also writes the `workspaces` output used by the workflow.

`check-backstage-version.js` compares every workspace's `backstage.json` with the
DevPortal host's `backstage.json`. Set `HOST_BACKSTAGE_VERSION` for an offline run;
`--strict` returns 1 when a workspace is behind. The default report mode returns 0.

Run locally from the repository root:

```sh
node scripts/ci/list-workspaces-with-changes.js main HEAD
node scripts/ci/check-backstage-version.js
HOST_BACKSTAGE_VERSION=1.52.0 node scripts/ci/check-backstage-version.js
```

CI gates are intentionally in report mode in this stage. Their contract is governed by
[ADR-0011](https://github.com/veecode-platform/devportal-plugins-parent/blob/main/docs/adr/0011-ci-gates-are-the-standards-versioning-by-changesets.md).
