# Plugin Decision Records

Workspace-local design decisions for `gitlab-pipelines`, numbered `PDR-001`, `PDR-002`, … and
cited outside this workspace as `gitlab-pipelines PDR-NNN`. They are plugin decision records,
not ADRs: decisions with cross-workspace or lasting weight live in the planning repository
`veecode-platform/devportal-plugins-parent` as `plugins ADR-NNNN`.

## PDR-001: Backend-Held Token and Entity-Anchored Authorization

**Date:** 2026-09-02 (design reviewed and approved); recorded here 2026-09-15
**Status:** Accepted
**Deciders:** Giovani Corrêa

### Provenance of this record

The design was written up on 2026-09-02 as "ADR-009" in the fork mission's planning
repository, `veecode-platform/devportal-planning`, on a branch that was never merged. That
number is taken on that repository's `main` by an unrelated decision, and this workspace's
sources cited it anyway, which left every citation pointing at either nothing or the wrong
document. The decision concerns one workspace, so on 2026-09-15 it was recorded here instead,
reconstructed from that draft and checked against the shipped code. Older commit messages in
this workspace still say "ADR-009 §N"; they mean the sections of this record.

### Context

The predecessor plugin (`platform-backstage-plugins`, npm 0.7.0) listed a catalog entity's
GitLab pipelines, created pipelines with variables, and cancelled or retried them. The need
that forced a redesign was self-service teardown: an entity provisioned from a scaffolder
template carries a manual `destroy` job, and its owner should be able to play that job from the
entity page instead of opening GitLab.

Three facts, verified on the source and on a live Backstage 1.52 tenant, blocked the plugin as
it stood:

1. **It was frontend-only and needed the user's `api` OAuth scope.** Every request went through
   the client, which first asked `gitlabAuthApi` for a token with `read_user`, `api`,
   `read_api` and `read_repository`, then reached GitLab through the Backstage proxy with
   unauthenticated access allowed. GitLab has no narrower write scope: `api` is full read and
   write on everything the user can reach. Granting it to the portal's OAuth application was
   vetoed, because the browser would hold that token for every signed-in user.
2. **No path in the UI played an existing manual job.** The client implemented the call, but
   nothing invoked it; both the jobs component and the pipeline list created a *new* pipeline
   instead. For a template whose `destroy` is `when: manual`, a new pipeline runs the earlier
   stages and leaves `destroy` waiting. Playing the job is the only route that does not require
   every consumer to change their `.gitlab-ci.yml`.
3. **The backend already held a write-capable credential**: the tenant's
   `integrations.gitlab[].token`, the group access token the scaffolder uses. No new secret was
   needed for a server-side design.

The in-house reference, `github-workflow-backend`, had moved its calls to a backend but
mirrored the whole provider UI: nine routes, each taking the repository slug and host from the
client, with `httpAuth` injected and unused and no permission check at all, so any signed-in
user could start any workflow the credential reached. The lesson taken was not "avoid a
backend" but "build a small backend whose size is the authorization funnel rather than the
route count".

### Decision

1. **Three packages in this workspace**: the backend (`pluginId` `gitlab-pipelines`), the
   frontend (a fork of the 0.7.0 source with its transport replaced) and a common library
   holding the shared types and the permission names. The old plugin is frozen and its npm
   0.7.0 stays published for existing consumers.
2. **The backend talks to GitLab with the integration token**, resolved through
   `ScmIntegrations` by host. The browser never holds a GitLab token; it calls the backend with
   the Backstage user token.
3. **Every route is anchored on a catalog entity**, under `/entities/:namespace/:kind/:name`.
   The client never sends a host, project or slug. The backend resolves the entity, reads its
   project annotation, derives the host from the source location and requires a matching
   `integrations.gitlab` entry.
4. **Four permissions**, all with `resourceType` `gitlab-pipelines-entity` and the entity ref as
   the resource: `gitlab.pipeline.read`, `gitlab.pipeline.trigger` (create and retry a
   pipeline), `gitlab.pipeline.play` (play and retry a job) and `gitlab.pipeline.cancel`. They
   go through `PermissionsService.authorize`, so they appear in the RBAC surface like any other
   plugin's.
5. **One authorization funnel runs before any GitLab call**, in this order: user credentials
   only, no service credentials; the entity exists, carries the annotation and its host has an
   integration, else 404 or 400 *before* authorizing; the route's permission, denial being 403;
   then the **ownership invariant**, where the entity's normalized owner must appear in the
   caller's ownership refs, read included, so the platform token never leaks the pipelines of
   entities the caller does not own; and finally, pipeline and job ids are only ever used under
   the already-resolved project. There is no implicit admin bypass. An `.any` permission for
   operators would be a future, explicit addition.
6. **Write-path guards.** Variables are key-value pairs whose keys match `^[A-Z_][A-Z0-9_]*$`,
   with `CI_` and `GITLAB_` prefixes rejected. A job is played only when its status is manual,
   otherwise the call is refused. Every write emits a structured log line naming the user, the
   entity, the project, the operation and the ids, because GitLab attributes all of it to the
   bot account. The MVP carries no idempotency key; the UI disables the control while a call is
   in flight.
7. **The frontend keeps its public surface** and its mount points, so existing
   `dynamicPlugins.frontend` configuration stays valid. Internally the client becomes a single
   call against the backend, the GitLab auth API and proxy URL are gone, the provider takes the
   entity ref from the entity context, and backend errors surface through the alert API. The
   one UI addition is expanding a pipeline row to its jobs, with play, retry and cancel per job.
8. **Actions Registry and MCP exposure are a later step**, not part of this decision. When
   added, each action must repeat the entity check itself and write actions must be marked
   destructive.
9. **No consumer changes their `.gitlab-ci.yml`.** Teardown plays the manual job that is
   already there, exactly as a person would in GitLab.

### Alternatives considered

- **Grant `api` to the OAuth application.** Zero code, but every signed-in user's browser holds
  a full-API GitLab token. Vetoed.
- **A scaffolder action triggering the pipeline.** Works with the existing token, but answers
  one template; this plugin serves any entity carrying the project annotation. Rejected.
- **Fork the frontend only and let the proxy inject the platform token.** A few lines, but a
  proxy cannot authorize per project, so any signed-in user could trigger any pipeline the
  group token reaches. Tolerable for reads, unacceptable for destroy. Rejected.
- **Per-project pipeline trigger tokens.** Least privilege for *creating* pipelines, but they
  cannot list jobs, play or cancel, and they need a create, store and revoke lifecycle. Not
  worth it here; may return as a refinement.
- **Mirror `github-workflow-backend`.** The same token model with no authorization and routes
  taking the repository from the client. Rejected as the shape to copy.

**Rationale:** the size of this backend is deliberate. It exists to be the one place where a
request is tied to an entity, an owner and a permission before a credential with broad reach is
used on the caller's behalf. Every simpler option removes that funnel, and the funnel is the
feature.

### Not covered by this record

The lifecycle reconciler and its teardown operations, added later, are a separate feature built
on top of this design. See `config.d.ts` and `src/service/lifecycleReconciler.ts`; a decision
record for it would be `PDR-002`.
