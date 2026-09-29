---
'devportal-marketplace-backend': minor
---

Add the nullable `requested_ref` and `resolved_digest` columns to `marketplace_installations`. The portal's install pre-step reads them when they exist and stores each resolved OCI digest in `resolved_digest`, so a restart installs the same image instead of resolving the tag again. `GET /api/extensions/pending-changes` also returns `failedInstalls`: the enabled packages that did not load at this boot and were not changed since it. `count` still counts only pending installs and removals.
