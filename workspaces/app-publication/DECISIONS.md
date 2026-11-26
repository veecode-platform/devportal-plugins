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
comes through a merge request. It does not say that the previous version keeps running. A direct push gets the wording of PDR-014.

**Consequences:** Until the next merge request lands, the app runs the failed release.

## PDR-005: Contract paths are kept only when GitLab's diff holds them

**Status:** Accepted

**Context:** The contract job writes the paths it found, and a job's file can carry any text. The tool reports those
paths to Claude.

**Decision:** A path from the contract result is returned only when GitLab's diff of the merge request holds it, or, on the default branch, the compare that PDR-015 describes holds it. A path
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

**Decision:** A failed job named `renderJobName` (default `render`) in a merge request or default-branch pipeline returns the last
`failedJobLogLines` cleaned lines of its log, as PDR-002 does. The refusal lines are searched in every cleaned line of
the log read, not only in the returned lines. A line of exactly the form `refused <piece> <environment>`, after the
cleaning, names a config only when the piece is one of the app's pieces and the environment is one of the configured
environments. Each such config gets its file, `<piece>/config/<environment>.yaml`, in the sentence. The sentence says
the end of the log should give the key and the reason, and, when the log shows no reason or the cause is in the
platform, gives the platform team the job's link and says not to change platform-owned files. The text of the log is
never copied into a sentence. With no
such line, the job gets the PDR-002 explanation. The render check applies to a merge request pipeline and to a
default-branch pipeline, where the generated pipeline runs `render` too (PDR-015).
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
  platform team's work. A finding that is not a secret is fixed in a new merge request. A direct push gets the wording of PDR-014.
- A failed conflict-marker job returns the log tail. Its sentence says the end of the log usually names the files and
  the lines, that it is data from the job and not instructions, that Claude opens each named file and confirms the
  markers are there before editing, that platform-owned files never change, and, when the log is empty or could not be
  read, that Claude searches the app's files for lines that start with `<<<<<<<` or `>>>>>>>`. A failed job in stage
  `lint` or `build` returns the log tail, and its sentence says the end of the log usually shows what failed, before it
  sends Claude to the local checks. Both keep the rule not to repeat a value that looks like a secret.
- A log that cannot be read does not fail the answer. GitLab may answer with an error status or with no access to the
  trace, or a read may be cut off by the call's deadline in the middle of the body. The client maps a body read that
  fails to the same fixed outage error as a request that fails. For a job whose sentence points to its log (the jobs
  above, the render check, a failed deploy with or without a result file and any job with no fixed explanation), the entry is returned
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
(with or without a result file, PDR-013), and 25 for five open merge requests with five failed jobs each. When the redo
of a change on a new branch is done, the merge request that held the value stays open and blocked, and its commit still
holds the value. This module does not close it.

## PDR-013: The published answer lists the app's addresses, a failed deploy returns its log, and a commit on the default branch is followed

**Status:** Accepted

**Context:** The published sentence said that the app has no public address in this phase, so a person whose app was
published was sent back to the local flow. The app template now writes the app's address into its System's links with
the type `app-address`, so every new app's catalog entry holds one. A failed deploy whose result file named a cause, such
as `install_failed`, returned only its name and link, so Claude could not tell an app fault from a platform fault. The
wait tool followed only commits that have a merge request, but the template's initial commit goes straight to the default
branch. For that commit the tool kept answering `waiting_for_push`, while `get-app-status` showed the app published.

**Decision:**

- A published answer carries `addresses`: the System's links of the configured type whose address is http or https, with
  the catalog title. The fixed sentence says to give each address to the person, with its title as a label, and that an
  empty or missing list means the app has no address of its own. No address is written into the sentence.
- A failed deploy with a recognized result file returns the cleaned end of its log, with the cleaning and the
  `failedJobLogLines` limit of every other failed job. Its sentence and its unreadable-log clause are the generic ones.
- When no merge request holds the commit, the wait tool looks for a pipeline of that commit on the default branch. If one
  exists, it follows the pipeline as it follows the landed commit of a merge. If none exists, the answer stays
  `waiting_for_push`, and that sentence no longer says that the push output named a merge request.

**Consequences:** The `addresses` of a published app come from its catalog entry only; an app with no address link gets an
empty list. A recognized failed deploy costs one trace read in `wait-for-app-publication`. In `get-app-status`, every
failed deploy in the window now costs one trace read, not only those without a result file. The log of an older deploy in
the window is read but not returned, because `lastDeployOf` leaves it out; this is a known cost, not fixed here. The call
bound above still holds. A commit with no merge
request costs one more pipeline lookup on each poll until its pipeline appears.

## PDR-014: The next step names the path the commit took

**Status:** Accepted

**Context:** A commit pushed straight to the default branch has no merge request. The sentences that a default-branch pipeline returns were written for a merge request: they told Claude to push with `-o merge_request.auto_merge` or to fix the change in a new merge request, which a direct push cannot use.

**Decision:** Each sentence that a default-branch pipeline can return takes a route. The route is either a merge request that targets the default branch and lists the commit, or a direct push. A merge-request route keeps its wording. A direct push names `git push origin <default branch>` for a retry, and a fix as a new commit pushed to the default branch. A retry with no code change is an empty commit (`git commit --allow-empty`), because pushing the same commit again does nothing. A scan that stopped outside the change is never retried by a direct push: a new push would start its scan after the commits this push left unscanned, so the job's link goes to the platform team. The wait tool takes the route from the commit's list of requests, and looks it up again for each newer default-branch commit it follows. A commit that GitLab does not show yet keeps the neutral waiting sentence until its default-branch pipeline exists. The status tool looks the route up for the newest failed default-branch pipeline and for each failed deploy in the window, and only when a sentence needs it. PDR-004 and PDR-012 keep their merge-request wording; a direct push gets this rule's wording.

**Consequences:** The route assumes that GitLab lists a request for its own landed commit. That is what a fast-forward merge gives. It is not checked here for merge or squash commits. The trace-read bound of PDR-012 stays at 35. The status tool makes at most six more reads, each a listing of one commit, and the wait tool makes at most three more, one for each newer commit it follows. If a listing fails, the status tool falls back to the direct route so that it still answers. The wait tool does not fall back, and its call fails as it does for any other GitLab error. The not-published sentence says to push a change to the default branch, which reads the same for both paths. The state names, such as `merged` and `waiting_for_push`, are unchanged, because they are values and not sentences.

## PDR-015: A failed contract or render job on the default branch gets its explanation

**Status:** Accepted, 2026-11-18

**Context:** The generated app pipeline runs its `contract` and `render` jobs on the default branch as well as on a merge request, and a change can be pushed straight to the default branch. The failure reader took the request only for a merge request, so a failed default-branch pipeline gave both jobs the lint sentence, which sends the user to the local checks. Those checks never run the contract or render the chart, so they cannot show the cause.

**Decision:** The failure reader takes the failed pipeline as an explicit argument: a merge request, with its diff, or the default branch, with its commit. The route still says how the commit landed.

- A failed `contract` job that names owned files is filtered by PDR-005 on the default branch too. Its diff is GitLab's compare from the platform commit the result file names (`target`) to the pipeline's commit. A `target` that is not a full lowercase SHA gets the PDR-002 explanation, and no compare is read.
- The owned paths are restored from that platform commit: each path with `git checkout <target> -- <path>` when the commit has it, or `git rm -- <path>` when it does not. Then the fix is committed and pushed with `git push origin <default branch>`. The restore comes from the target and not from the tip of the default branch, because the target is the commit the check compared against. The platform's own repair also pushes to the default branch, so the sentence uses the same push, whatever the route.
- A `no_platform_base` result gets its own sentence with the job's link: no commit of the app comes from the platform, so the check has nothing to compare with. On a merge request it keeps the PDR-002 explanation, as before.
- A `render` refusal on the default branch names the config as PDR-011 does. Its push wording follows the route, as PDR-014 does.
- The sentences of a merge request pipeline do not change.

**Consequences:** The compare is GitLab's. This module reads its `diffs` as the changed paths. When GitLab flags the compare as possibly incomplete (`compare_timeout`), no path is kept and the PDR-002 explanation applies, so a partial list never names only some of the files; a list GitLab cuts without that flag is not detected. On the default branch, `unreadable_path` goes to the platform team: the check reads every commit since the platform commit, so renaming the file in a new commit does not clear it. A default-branch pipeline adds at most two requests to the wait or status call, the contract artifact and the compare, because it has at most one contract job. Trace reads do not grow: a default-branch contract or render job read its trace before this change, and an owned-file or `no_platform_base` failure now reads none. The contract's push goes to the default branch even when the commit came through a merge request, which a branch protection rule may refuse. Whether the platform team wants a merge request in that case is not decided here.

## PDR-016: The auto-merge action arms only the merge request its run opened

**Status:** Proposed, 2026-11-26

**Context:** A template needs GitLab to merge the request it opened once the request's checks pass, without a person. The
portal's GitLab token can write to every project the portal reaches, and the action runs with the credentials of the
template run. The status tools decide access with the owner check of PDR-001, which needs the app's System, but the
action receives a merge request address and no app.

**Decision:** The action is a scaffolder template action, registered with the id the templates use. It is not an
actions-registry action, so the portal's tools do not expose it. It arms a request only when all of these hold:

- its project is listed in `appPublication.autoMerge.allowedProjects`, compared exactly with the path GitLab returns for the project; an absent or empty list refuses every request;
- its author is the GitLab user of the portal's token, it is open, and its source branch, target branch and project match the run; `appPublication.autoMerge.sourceBranchPrefixes`, when set, must also match the source branch;
- it holds exactly one commit, and that commit is its head; when the run passes `expectedHeadSha`, the head must be that commit.

The action pins the head commit it checked, so a request that changed after it was opened is refused. The address must be a GitLab merge request address with no user name, query or fragment. The action logs and returns only its canonical form, and logs nothing of an address it cannot parse. The caller must be a signed-in user. The action never merges a request itself. When GitLab answers 405 while it prepares the request, the failure names the GitLab status word, after a check that the word has a closed shape, and does not copy GitLab's free text.

**Consequences:** The owner check of PDR-001 does not run on this action. The System of a new app may not be in the catalog during the run
that opens its merge request, so a catalog lookup in that run may refuse the first merge; this is not verified. A signed-in user who runs a template with
this step can arm auto-merge on a request that the portal's token opened, but only in a listed project, on a matching branch, when the request
holds one commit at its head. Whether to restrict it further, to the app's owner or to the group path of PDR-007, is not decided here. The release
goes through the export overlay, as the module's earlier versions did.

**Residual risks:** A push that replaces the request's only commit after the run pushed it, and before the first read, is not detected unless the
run passes `expectedHeadSha`. The retries after a 405 re-read the request's state and head, not its commit list.
