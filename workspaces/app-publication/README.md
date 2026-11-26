# app-publication

This workspace contains a `backend-plugin-module` for the scaffolder plugin
(`plugins/scaffolder-backend-module-app-publication`). It registers two read-only actions that the
portal's MCP server exposes as tools. They report whether a change to an app is merged, deployed and
smoke-checked, so Claude can tell a business user what happened without that user opening GitLab or the
cluster.

- `get-app-status` takes `{ app }` and returns the app's sheet: its pieces, the last deploy of each
  environment with its smoke result, the default branch's newest pipeline and the open merge requests.
  It returns one `state` and one `nextStep`. It never waits.
- `wait-for-app-publication` takes `{ app, commit, mergeRequest? }` and follows a pushed commit, through its merge
  request or straight on the default branch, for at most `maxWaitSeconds` (20 by default). It returns `done`, a `state`,
  the facts it read and a `nextStep`. Once the app is published, it also returns `addresses`, the app's addresses from
  its catalog entry.

A failed job in a pipeline is returned with its name, stage and link. For a failed lint, build, scan, render,
conflict-markers or deploy job, and for any other failed job with no fixed explanation, the last `failedJobLogLines` lines of its
log come back in `untrustedJobOutput`, cleaned of the runner's prefix and escape sequences, with each e-mail address
replaced by `[email]`. When GitLab cannot give the log, the entry comes back without it and its sentence says so. A job
name that holds `:` or `/` is shown only when it is one of the configured job names or is in `knownJobNames`.

Only the app's owner may call either one. The decisions behind the choices are in [DECISIONS.md](DECISIONS.md).

## Auto-merge template action

`gitlab:merge-request:auto-merge` is a scaffolder template action. A template calls it after `publish:gitlab:merge-request`,
so the merge request the run opened merges by itself once GitLab's merge checks pass, without a person.

Input:

- `mergeRequestUrl` (required): the `mergeRequestUrl` output of `publish:gitlab:merge-request` in the same run.
- `sourceBranch` (required): the branch the run opened the merge request from.
- `targetBranch` (default `main`): the branch the merge request targets.
- `removeSourceBranch` (default `true`): whether GitLab deletes the source branch after the merge.

Output:

- `mergeRequestUrl`, and `headSha`, the head commit that auto-merge is pinned to.
- `status`: `armed` when GitLab merges the request once its checks pass, or `merged` when GitLab merged it at once.

Before it sets anything, the action checks that:

- the link is a GitLab merge request address on a host the portal has a GitLab integration for;
- the caller is a signed-in user;
- the portal's GitLab token belongs to the user who opened the merge request, so a request opened by someone else is refused;
- the request is open, comes from the run's source branch into the target branch, and comes from the same project, not a fork.

It sets auto-merge pinned to the request's head commit. If the head moved after the request was opened, GitLab answers with a
conflict and nothing is set. If GitLab is still preparing the request, the action reads the request again and retries up to
three times, three seconds apart. It retries only while GitLab reports a preparing status and the head has not moved. Any
other refusal fails the run with a sentence that says nothing was merged. The action never merges a request itself, and it
does not log the token or any request header. The reasons for these choices are in [DECISIONS.md](DECISIONS.md) (PDR-016).

## Configuration

`appPublication.projectPathPrefix` is required: the GitLab group path under which every app project must sit, for
example `example-org/apps`. An app whose catalog entry names a project outside it is refused. The other keys are optional;
`config.d.ts` lists them with their defaults. GitLab hosts and tokens come from `integrations.gitlab`.
`app-config.yaml` shows an example with a placeholder host.

## Development

Run the commands in [AGENTS.md](AGENTS.md) from this folder.
