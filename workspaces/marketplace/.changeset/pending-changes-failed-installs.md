---
'devportal-pending-changes': minor
---

Add `failedInstalls` to `PendingChangesResponse`: the stored package of each enabled plugin that did not load and has not changed since the backend started. `PendingChangesClient` returns an empty list when the backend omits the field or answers with an error status.
