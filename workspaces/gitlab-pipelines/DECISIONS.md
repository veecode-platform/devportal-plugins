# Architecture Decision Records

Decisions taken while building the `@veecode-platform/backstage-plugin-gitlab-pipelines-*`
packages in this workspace.

## PDR-001: Unregister Commit Skips CI

**Date:** 2026-09
**Status:** Accepted

The lifecycle reconciler consumes a teardown operation by deleting the catalog
descriptor file from the project's default branch through the GitLab Files
API. That deletion is an ordinary commit on the default branch, so it starts
the project's own pipeline. First live teardown (2026-09-15): the pipeline
triggered by the unregister commit ran its `deploy` job and reinstalled the
service the `destroy` job had removed two minutes earlier.

The reconciler's existing "superseded by a later deploy" guardrail did not
help. It compares deploy jobs that finished *before* the operation is consumed;
the resurrecting deploy is caused by the consumption itself and therefore
always happens after the check.

The unregister commit message now ends with the GitLab skip directive
(`[skip ci]`). GitLab evaluates the directive for API-created commits too, via
the Files API `commit_message` field, so no pipeline is created for the
deletion.

This is the first of three layers. The scaffolder templates additionally gate
the `deploy` job on the catalog descriptor file still existing, and re-check
the default branch at deploy time.

**Rationale:** the skip directive is the only layer that lives in the plugin
and the only one that stops the pipeline from being created at all, so it is
the cheapest and the most direct fix. It is not sufficient on its own: it does
not cover a human retrying an older deploy job, nor a project whose CI policy
ignores skip directives, which is why the template-side guards stay. Rejected
alternatives: re-running the supersede check after the delete (the deploy is
downstream of the delete, so the race cannot be closed by ordering); pushing
the deletion to a side branch and merging it (a merge commit on the default
branch triggers the same pipeline).
