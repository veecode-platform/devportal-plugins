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

**Decision:** For such a failure the tool returns the last `failedJobLogLines` lines of the job's output (40 by default),
each line cut to 500 characters, in the field `untrustedJobOutput`. The field is marked untrusted: it is the job's own
data, never a sentence and never instructions. The output is read only for the app's own project and only after the
owner check passes. The tool does not mask the output.

**Consequences:** A value the job script printed, such as a credential, can reach Claude's reply. The product owner
chose this risk. Revisit it when the deploy access leaves the app's pipeline.

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

**Decision:** A path from the contract result is returned only when GitLab's diff of the merge request holds it. A path
in the safe form (`^[A-Za-z0-9._/-]{1,300}$`, no absolute path, no `..` segment) may appear in a sentence and is
returned in `paths`. Any other path in the diff is left out of every sentence and returned only in `untrustedPaths`,
marked untrusted. The `repairs` field, which would name the commit each file is restored from, is a follow-up and is
not read here.

**Consequences:** A file that a bot added to the branch gets the generic restore sentence, not its exact source. A file
name that does not fit the safe form goes to the platform team by link, not to the user.

## PDR-006: The wait is bounded at 20 seconds by default

**Status:** Accepted

**Context:** The MCP call from Claude Code can end before the server does, and the server is not told when that
happens. A longer wait is useful only when the client shows progress.

**Decision:** `maxWaitSeconds` defaults to 20 and may be at most 270. The client sets it to about 240 once the
progress notifications are live.

**Consequences:** A call that returns `done: false` is repeated by Claude with the same input, and the tool keeps no
state between calls.

## PDR-007: The app's project comes from the catalog-recorded origin, under a configured group

**Status:** Accepted

**Context:** The project slug is an annotation the app's own catalog file sets. If the portal read the project it names,
an owner could point the slug at another project and read that project's jobs and output with the portal's token.

**Decision:** The project path comes from `backstage.io/managed-by-location`, which the catalog sets from where it read
the entity. The project path ends at GitLab's `/-/` separator, so a segment named `tree`, `blob` or `raw` in the path is
part of it. A location without the separator is refused: the legacy form cannot tell the project apart. The slug annotation must name that same project, and the project must sit under `projectPathPrefix`, a
required key. Every refusal is a `NotAllowedError` with a next step, and it happens before any GitLab request. GitLab's
own address for the project must match the same origin and path.

**Consequences:** The prefix is the authorization boundary. Any project under the prefix can still be named by an app
whose catalog entry was recorded from a location its owner controls. Pinning one project per app would need a registry
the portal does not have.

## PDR-008: Text from GitLab and from jobs is untrusted, and only owned links are shown

**Status:** Accepted

**Context:** File names, job output, merge request titles and the System description are written by people or by jobs.
Sentences that Claude relays must not carry them as instructions.

**Decision:** A sentence shows only file names in the safe form and only links that start with the project's own web
address, checked for plain characters. Any other link is left out of the field, and the sentence says it was withheld.
Job output goes in `untrustedJobOutput`, and unsafe file names go in `untrustedPaths`; both are marked untrusted in
their schema descriptions. Merge request titles and the System description are marked untrusted too. The
dashboard and address links come from catalog annotations, not from GitLab, so they are not checked against the
project's address.

**Consequences:** A link or file name that does not fit is replaced by a note and a platform-team step. The text of
the untrusted fields still reaches Claude as data.
