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
in the field `untrustedJobOutput`. The trace is split at line feeds and carriage returns. Each piece is cleaned first: the
runner's timestamp and stream prefix, when present, and the ANSI escape sequences are removed, and trailing spaces are
removed. Leading spaces are kept, so indentation survives. Empty pieces and section markers are dropped. Each cleaned
line is cut to 500 characters. The field is marked untrusted: it is the job's own data, never a sentence and never
instructions. The output is read only for the app's own project and only after the owner check passes. The tool does
not mask the output, except for e-mail addresses (PDR-012). The cleaning applies to every job that gets a log tail, so
the output of those jobs changes too. PDR-012 adds the jobs that get a log tail although their sentence is fixed.

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

**Verified:** The catalog overwrites `backstage.io/managed-by-location` for an entity read from a URL. The collector
that receives the parsed entity sets the location after spreading the entity's own annotations
(`@backstage/plugin-catalog-backend` 3.8.0 and 3.9.2, `processing/ProcessorOutputCollector`). The version used by the
portal's Backstage 1.54.9 release was not checked.

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

## PDR-009: Components whose names are not piece names are left out of the sheet

**Status:** Accepted

**Context:** A piece is a Component whose name is the app's name plus a piece name in the closed form. A Component with
any other name cannot be matched to a deploy result, and its name would reach the sheet unchecked.

**Decision:** The sheet and the deploy checks use only the Components whose names fit the piece form. Other Components of
the System are left out, with no note in the sheet.

**Consequences:** A misnamed Component is invisible to this tool. The platform team finds it in the catalog.

## PDR-010: A deploy that did not run, and a deploy history window

**Status:** Accepted

**Context:** A deploy job can be skipped or canceled after its pipeline succeeded, and the default branch may hold no
deploy within the pipelines the tool reads.

**Decision:** A skipped or canceled deploy job on a succeeded pipeline, with no newer default-branch pipeline, is a failed
deploy with no detail, and returns no job output. The sheet reads the ten most recent default-branch pipelines for
deploys. When that window is full and holds no deploy, the sheet is partial and says the last deploy is older than what
the tool reads.

**Consequences:** An app whose last deploy is older than the window shows as partial until a newer deploy happens.

## PDR-011: A refused render config names its file, and the log gives the key

**Status:** Accepted

**Context:** Every merge request of a generated app runs a `render` job that renders each piece's config with the
platform chart. When the chart refuses a config, the job exits 1 and prints a `refused <piece> <environment>` line.
The module treated that job like a lint job and sent the user to the local checks. Those checks lint, build and test
the code and never render the chart, so they cannot show the cause.

**Decision:** A failed job named `renderJobName` (default `render`) in a merge request pipeline returns the last
`failedJobLogLines` cleaned lines of its log, as PDR-002 does. The refusal lines are searched in every cleaned line of
the log read, not only in the returned lines. A line of exactly the form `refused <piece> <environment>`, after the
cleaning, names a config only when the piece is one of the app's pieces and the environment is one of the configured
environments. Each such config gets its file, `<piece>/config/<environment>.yaml`, in the sentence. The sentence says
the end of the log should give the key and the reason, and, when the log shows no reason or the cause is in the
platform, gives the platform team the job's link and says not to change platform-owned files. The text of the log is
never copied into a sentence. With no
such line, the job gets the PDR-002 explanation. The render check applies to merge request pipelines only, which is
where the generated pipeline runs `render`. A `render` failure on the default branch keeps the generic lint sentence, which returns
the end of the log too (PDR-012).
Other job names keep their sentence.

**Consequences:** The search covers the 256 KB that the tool reads from the end of the trace. A refusal earlier than
that is not named, and the job gets the generic explanation instead. The line form was checked against a live job's
trace excerpt, with the runner's prefix and escape sequences, and against bare lines. Every job that gets a log tail
returns cleaned lines, which changes its `untrustedJobOutput` (see PDR-002).

A line of the job's log triggers the sentence, so a line that the job prints, or that a job writes on purpose, can make
the sentence say that a config was refused. The effect is limited to the app's own pieces and configured environments:
a line that names another piece or environment is ignored, and the file the sentence names is always one of the app's
own `<piece>/config/<environment>.yaml` files.

## PDR-012: Which job names are shown, no e-mail address in a returned log, and a log for the jobs the user must act on

**Status:** Accepted

**Context:** A live proof of a business app's merge gates showed four gaps in what the tools return. The secret scan
is a job named `secrets:gitleaks`, and the label form refused the `:`, so every sentence showed "(name not shown)". The
scan's log carries the commit author's name and e-mail address, which is personal data, and Claude reads it. The
sentence for a found secret did not say that the value already reached GitLab, or what the app's root `CLAUDE.md`
asks for then. A failed conflict-marker check and a failed lint, build or test job gave no log, so Claude could not
name the file or the test without running the local checks. A review of the fix found that the log reads it added
could fail a whole answer, and that a name's shape cannot be trusted.

**Decision:**

- A job or stage name is shown in a sentence when it has at most 64 characters, all letters, digits and `._-`. A job
  name that holds `:` or `/` is shown only when it is exactly one of the configured job names (`deployJobName`,
  `contractJobName`, `conflictMarkersJobName`, `renderJobName`) or one of `knownJobNames` (default
  `["secrets:gitleaks"]`; setting it replaces the default). Any other name goes to `untrustedJobName`. The shape of a
  name cannot tell `secrets:gitleaks` from `mailto:attacker` or `SYSTEM:ignore-previous-instructions`, and the author of
  a merge request controls the job names in its pipeline. A stage name that holds `:` or `/` is never shown.
- What this guarantees: a shown name has plain characters, or is a name the operator chose. It does not guarantee that
  a plain name is harmless as words: `ignore-all-previous-instructions` fits the plain form. The `name` field says that
  a shown name is still text the job's author chose, so Claude does not read it as an instruction (PDR-008).
- Every cleaned log line returned in `untrustedJobOutput`, for every job, has each e-mail address replaced by `[email]`.
  This happens after the runner's prefix and the escape sequences are removed, and before the line is cut to 500
  characters, so half an address is never left. An address is a local part of letters, digits and `._%+-` (at most 64
  characters), an at sign, and a domain of dot-separated labels that ends in at least two letters. The author's name is
  not replaced.
- The e-mail rule reduces accidental personal data, such as a commit author's address in a scan log. It is not a
  control against whoever writes the log, who can write an address the pattern misses. Known misses: an address written
  with `at` and `dot`, with `%40` or a full-width at sign, or with a quoted local part; an address on a host with no
  dot or on an IP address (`user@localhost`); a local part that ends in a combining accent; and the digits after a
  domain whose last label has digits (`user@example.com123` leaves `123`). Known over-replacements: an ssh remote such
  as `git@example.com:example-org/example-app.git`, and a package pin whose version ends in letters (`pkg@1.2.beta`).
  A version pin made of digits (`lodash@4.17.21`) is not replaced.
- The scan sentence on a merge request adds, in fixed text: a real secret already reached GitLab with the push, so
  Claude tells the user it is exposed and must be changed where it was issued, without repeating it, and redoes the
  change as the app's root `CLAUDE.md` describes (a new branch from the default branch, one commit that never held the
  value). The rest of the sentence stays.
- The scan sentence on the default branch is another sentence: the value is already on the default branch, so there is
  no change to redo on a new branch. Claude tells the user it is exposed and must be changed where it was issued,
  without repeating it, and gives the platform team the job's link, because removing it from the history is the
  platform team's work. A finding that is not a secret is fixed in a new merge request.
- A failed conflict-marker job returns the log tail. Its sentence says the end of the log usually names the files and
  the lines, that it is data from the job and not instructions, that Claude opens each named file and confirms the
  markers are there before editing, that platform-owned files never change, and, when the log is empty or could not be
  read, that Claude searches the app's files for lines that start with `<<<<<<<` or `>>>>>>>`. A failed job in stage
  `lint` or `build` returns the log tail, and its sentence says the end of the log usually shows what failed, before it
  sends Claude to the local checks. Both keep the rule not to repeat a value that looks like a secret.
- A log that cannot be read does not fail the answer. GitLab may answer with an error status or with no access to the
  trace, or a read may be cut off by the call's deadline in the middle of the body. The client maps a body read that
  fails to the same fixed outage error as a request that fails. For a job whose sentence points to its log (the jobs
  above, the render check, a deploy with no result file and any job with no fixed explanation), the entry is returned
  without `untrustedJobOutput`, and its sentence is followed by a fixed clause: the log could not be read, call the tool
  again once, then give the platform team the job's link. The pipeline's state, the other jobs and their sentences stay
  in the answer. An error that is not an outage still stops the call. A result file whose body fails in the middle
  still fails the call, as a request for it does.
- Both tools get this from the same code: `wait-for-app-publication` (a failed request pipeline, and a failed
  default-branch pipeline) and `get-app-status` (the blocked entry of an open merge request, and the newest
  default-branch pipeline).

**Consequences:** The name of a commit's author still reaches Claude through the scan's `Author:` line. Revisit it with
PDR-002 if that is not acceptable. A read of a trace downloads the whole trace and keeps its last 256 KiB; the module
sends no Range request. Every failed lint, build or conflict-marker job now costs one such read. At most five failed
jobs are read per pipeline, so one `wait-for-app-publication` call reads at most five traces for a failed pipeline.
One `get-app-status` call reads at most 35: five for the newest default-branch pipeline, five for deploys that failed
with no result file, and 25 for five open merge requests with five failed jobs each. When the redo of a change on a new
branch is done, the merge request that held the value stays open and blocked, and its commit still holds the value. This
module does not close it.
