---
'devportal-marketplace-backend': minor
---

Keep one row per plugin in `marketplace_installations`. Installing or uninstalling a newer reference of a plugin that is already stored (the catalog now offers a newer tag or digest) replaces the stored row instead of adding a second one, which made the next boot fail with `Duplicate OCI plugin configuration`. The new row inherits the replaced row's `pluginConfig` when it brings none, and the package lookups find the row of an older reference of the same plugin. The migration `one_row_per_plugin` deletes the duplicates a portal already holds: it keeps the enabled row, then the most recently updated one, then the one with the later `package_name`. Its `down` does nothing, because deleted rows cannot be restored. The file storage fallback follows the same rule.
