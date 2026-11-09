# Workspace decisions

## PDR-001: Only the System's owner may call either action

**Status:** Accepted

**Context:** Both actions read a business app's GitLab project with the portal's token, which can read every
project the portal reaches. The app-secrets module already limits its actions to the owner.

**Decision:** The owner check of the app-secrets module is copied: a signed-in user who owns the System, directly or
through a group. A service principal is refused. The check runs before any GitLab request, so a caller who is not
the owner gets no GitLab data at all.

**Consequences:** Platform staff who want an app's status read the pipeline in GitLab instead of calling the tools.

## PDR-002: A failed job with no fixed explanation returns the end of its log

**Status:** Accepted

**Context:** A job's log can show what the job's script printed, and the business user cannot open GitLab to read it.
A failure with no fixed sentence otherwise leaves the user with nothing to act on.

**Decision:** For such a failure the tool returns the last `failedJobLogLines` lines of the job's log (40 by default),
each line cut to 500 characters, with the job's link. The end of the log is read only for the app's own project and
only after the owner check passes. The tool does not mask the log.

**Consequences:** A value the job script printed, such as a credential, can reach Claude's reply. The owner accepted
this risk on 2026-11-09. Revisit it when the deploy access leaves the app's pipeline.

## PDR-003: The smoke result is read as schema 2 only

**Status:** Accepted

**Context:** The deploy job of a business app writes one smoke result per piece. An older schema describes one smoke
job for one release, and no app in production uses it yet.

**Decision:** A `smoke-result.json` that is not schema 2, is missing, or fails validation gives "failed, no detail".
Schema 1 is not mapped.

**Consequences:** An app created before schema 2 shows "no detail" after a failed deploy until its pipeline writes
schema 2.

## PDR-004: A failed install keeps its release; there is no Helm rollback

**Status:** Accepted

**Context:** The deploy job installs each piece with Helm and runs the smoke test. Rolling back a failed install would
hide the failing release from the platform team.

**Decision:** The sentence for an install failure says that the failed release stays installed and that the next fix
comes through a merge request. It does not say that the previous version keeps running.

**Consequences:** Until the next merge request lands, the app runs the failed release.

## PDR-005: Contract paths are kept only when GitLab's diff holds them

**Status:** Accepted

**Context:** The contract job writes the paths it found, and a job's file can carry any text. The tool reports those
paths to Claude.

**Decision:** A path from the contract result is returned only when GitLab's diff of the merge request holds it, and
only when it is a plain path with no control character and no `..` segment. The `repairs` field, which would name the
commit each file is restored from, is a follow-up and is not read here.

**Consequences:** A file that a bot added to the branch gets the generic restore sentence, not its exact source.

## PDR-006: The wait is bounded at 20 seconds by default

**Status:** Accepted

**Context:** The MCP call from Claude Code can end before the server does, and the server is not told when that
happens. A longer wait is useful only when the client shows progress.

**Decision:** `maxWaitSeconds` defaults to 20 and may be at most 270. The client sets it to about 240 once the
progress notifications are live.

**Consequences:** A call that returns `done: false` is repeated by Claude with the same input, and the tool keeps no
state between calls.
