---
'devportal-marketplace-backend': minor
---

Add the nullable `requested_ref` and `resolved_digest` columns to `marketplace_installations`. The portal's install pre-step reads them when they exist and stores each resolved OCI digest in `resolved_digest`, so a restart installs the same image instead of resolving the tag again. `GET /api/extensions/pending-changes` also returns `failedInstalls`: the enabled packages that did not load at this boot and were not changed since it. A package counts as loaded when a loaded plugin matches the `spec.packageName` of its catalog entity, the rule the catalog uses for `installStatus`, so a package the catalog does not know is never listed. `pendingInstalls` and `pendingRemovals` use the same rule, so a package without a `!selector` that is disabled while loaded now reaches `pendingRemovals`. `count` still counts only pending installs and removals.
