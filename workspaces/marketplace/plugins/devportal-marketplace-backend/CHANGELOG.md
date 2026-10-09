# devportal-marketplace-backend

## 0.3.1

### Patch Changes

- 478d087: Reject YAML with a syntax error when a plugin is installed or its configuration is saved. The install page no longer sends it and shows the line and column of the first error; `POST /plugin/:namespace/:name/configuration` answers 400 with the same position. Before, the page re-serialized whatever the parser recovered, so a mis-indented key, an unclosed quote or a tab could be stored as a different configuration than the one typed.
- 4f49922: Store the YAML typed on a plugin's install and edit page. `POST /plugin/:namespace/:name/configuration` ignored it and stored the `pluginConfig` already saved or the package's first `appConfigExamples` entry. The example is now added only to a package entry that comes without `pluginConfig`.

## 0.3.0

### Minor Changes

- 9ec789d: Keep one row per plugin in `marketplace_installations`. Installing or uninstalling a newer reference of a plugin that is already stored (the catalog now offers a newer tag or digest) replaces the stored row instead of adding a second one, which made the next boot fail with `Duplicate OCI plugin configuration`. One case is left alone: a reference without a `!selector` that matches stored rows with two or more different selectors of the same OCI image replaces nothing and is stored as its own row (devportal-core leaves such a row out of the generated install file and logs a warning). The new row inherits the replaced row's `pluginConfig` when it brings none, and the package lookups find the row of an older reference of the same plugin. The migration `one_row_per_plugin` deletes the duplicates a portal already holds: it keeps the enabled row, then the most recently updated one, then the one with the later `package_name`. A group that such a selector-less row links is left untouched. Its `down` does nothing, because deleted rows cannot be restored. The file storage fallback follows the same rule. On PostgreSQL, each write locks `marketplace_installations` in `SHARE ROW EXCLUSIVE` mode before it reads, so two concurrent installs of one plugin cannot both add a row.

## 0.2.0

### Minor Changes

- 6134b03: Add the nullable `requested_ref` and `resolved_digest` columns to `marketplace_installations`. The portal's install pre-step reads them when they exist and stores each resolved OCI digest in `resolved_digest`, so a restart installs the same image instead of resolving the tag again. `GET /api/extensions/pending-changes` also returns `failedInstalls`: the enabled packages that did not load at this boot and were not changed since it. A package counts as loaded when a loaded plugin matches the `spec.packageName` of its catalog entity, the rule the catalog uses for `installStatus`, so a package the catalog does not know is never listed. `pendingInstalls` and `pendingRemovals` use the same rule, so a package without a `!selector` that is disabled while loaded now reaches `pendingRemovals`. `count` still counts only pending installs and removals.
