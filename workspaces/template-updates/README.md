# Template updates

This workspace exports a Scaffolder backend module that carries a new template
version into an existing project. It reads the project's K1 record, renders the
old and new template revisions at commit SHAs, merges the project tree, and opens
or reuses one GitLab merge request. Text conflicts remain marked for review.

The example flow is in `examples/update-from-template/template.yaml`. It accepts
a Component entity reference and an optional target template version. A project
whose record already matches the target skips the render, merge, and publish steps.

## Actions

- `veecode:template:read-record` resolves the project and template catalog
  entities, validates the recorded values against the target template schema,
  and resolves both version tags to commit SHAs.
- `veecode:template:merge` applies the three-way file rules and writes the full
  result to `.template-update/result`.
- `veecode:template:publish-mr` computes GitLab create, update, and delete
  actions against the project default branch, then creates or reuses the update
  merge request.

Catalog owners are named in the merge request description. Mapping catalog
groups to GitLab assignees is outside this module's scope.

## Development and proof

Run commands from this workspace root:

```sh
yarn install
yarn start
yarn tsc:full
yarn lint:all
yarn prettier:check
yarn test:all
yarn workspace @veecode-platform/plugin-scaffolder-backend-module-template-update export-dynamic
```

For Proof 1, the backend dev shell starts the Scaffolder backend with the module
registered. `GET /api/scaffolder/v2/actions` must list all three action IDs.
Proof 2 is run separately in `devportal-local` before publication.
