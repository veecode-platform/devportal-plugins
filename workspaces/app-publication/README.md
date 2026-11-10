# app-publication

This workspace contains a `backend-plugin-module` for the scaffolder plugin
(`plugins/scaffolder-backend-module-app-publication`). It registers two read-only actions that the
portal's MCP server exposes as tools. They report whether a change to an app is merged, deployed and
smoke-checked, so Claude can tell a business user what happened without that user opening GitLab or the
cluster.

- `get-app-status` takes `{ app }` and returns the app's sheet: its pieces, the last deploy of each
  environment with its smoke result, the default branch's newest pipeline and the open merge requests.
  It returns one `state` and one `nextStep`. It never waits.
- `wait-for-app-publication` takes `{ app, commit, mergeRequest? }` and follows a pushed commit for at
  most `maxWaitSeconds` (20 by default). It returns `done`, a `state`, the facts it read and a `nextStep`.

A failed job in a pipeline is returned with its name, stage and link. For a failed lint, build, scan, render or
conflict-markers job, and for any other failed job with no fixed explanation, the last `failedJobLogLines` lines of its
log come back in `untrustedJobOutput`, cleaned of the runner's prefix and escape sequences, with each e-mail address
replaced by `[email]`.

Only the app's owner may call either one. The decisions behind the choices are in [DECISIONS.md](DECISIONS.md).

## Configuration

`appPublication.projectPathPrefix` is required: the GitLab group path under which every app project must sit, for
example `example-org/apps`. An app whose catalog entry names a project outside it is refused. The other keys are optional;
`config.d.ts` lists them with their defaults. GitLab hosts and tokens come from `integrations.gitlab`.
`app-config.yaml` shows an example with a placeholder host.

## Development

Run the commands in [AGENTS.md](AGENTS.md) from this folder.
