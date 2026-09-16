# Architecture Decision Records

Decisions taken during the migration of kong-service-manager plugins from
[platform-backstage-plugins](https://github.com/veecode-platform/platform-backstage-plugins)
to the new `@veecode-platform/backstage-plugin-kong-service-manager-*` packages.

## ADR-001: New Backstage Backend System

**Date:** 2025-01
**Status:** Accepted

The old plugin supported both the legacy (`createRouter`) and new backend
systems. The new implementation targets **only** the new Backstage backend
system (`createBackendPlugin`).

**Rationale:** The legacy backend system is deprecated. Shipping only the new
system reduces maintenance surface and aligns with Backstage direction.

## ADR-002: Drop Controller Layer

**Date:** 2025-01
**Status:** Accepted

The old backend used a controller layer (`KongController`, `ServiceController`,
`RoutesController`, `PluginsController`) that mixed permission checks with
request handling.

The new backend uses a flat **router + service** pattern: the Express router
handles HTTP concerns and Zod validation, then delegates to
`KongServiceManagerService` for Kong Admin API calls.

**Rationale:** Simpler code, fewer abstractions. Permission enforcement is
deferred to a later phase (see ADR-004) and will be added as middleware, not
embedded in controllers.

## ADR-003: Zod Validation on All Mutation Endpoints

**Date:** 2025-01
**Status:** Accepted

Every POST/PATCH/DELETE endpoint validates path params and request body with
Zod schemas before calling the service layer.

**Rationale:** Catches malformed requests early, provides clear error messages,
and serves as living documentation for the API contract.

## ADR-004: Defer Permission Enforcement

**Date:** 2025-01
**Status:** Superseded by ADR-010

The 12 core permissions are **defined** in the common library but are **not
enforced** in the backend router yet. Enforcement is planned for Phase 6.

**Rationale:** Get the core CRUD working and tested first. Permissions add
complexity that is easier to layer on once the base is stable.

## ADR-005: Simplified Permission Set

**Date:** 2025-01
**Status:** Accepted

The old implementation defines 22 permissions including per-category plugin
permissions (AI, Auth, Security, etc.) and spec permissions. The new
implementation starts with 12 core permissions covering read/write for
services, routes, and plugins.

**Rationale:** Category-level permissions are a power-user feature. Starting
with a smaller, simpler set reduces initial complexity. Additional permissions
can be added in Phase 9 without breaking changes.

## ADR-006: Defer OpenAPI Spec and Git Integration

**Date:** 2025-01
**Status:** Accepted

The old plugin includes a full OpenAPI spec viewer with Git-based PR workflows
(GitHub and GitLab providers). This is **not** included in the initial
migration.

**Rationale:** The spec/Git integration is the most complex feature in the old
plugin and touches external systems (GitHub API, GitLab API). Deferring it
lets us ship a solid core faster. Planned for Phases 7-8.

## ADR-007: Context-Based State Management

**Date:** 2025-01
**Status:** Accepted

The frontend uses a single React Context with `useReducer` for global state
management (`KongServiceManagerContext`), rather than per-component local
state or a third-party state library.

**Rationale:** Keeps dependencies minimal. The plugin state is modest in size
(one service, its routes, its plugins) and fits well in a single context.
The reducer pattern makes state transitions explicit and testable.

## ADR-008: Plugin Category Mapping in Frontend Client

**Date:** 2025-01
**Status:** Accepted

The mapping of Kong plugin names to UI categories (authentication, security,
traffic-control, etc.) lives in the frontend `KongServiceManagerClient`, not
in the backend or common library.

**Rationale:** This is purely a UI concern. The backend returns raw Kong data;
the frontend decides how to present it. If the mapping needs to be shared
later (e.g., for category-level permissions), it can be moved to common.

## ADR-009: Single Package for Frontend Plugin

**Date:** 2025-01
**Status:** Accepted

Unlike some Backstage plugins that split into `-react` (hooks/context) and
main (components) packages, kong-service-manager ships as a single frontend
package.

**Rationale:** The plugin is self-contained. There is no need for other
plugins to consume its hooks or context. A single package is simpler to
publish and consume.

## ADR-010: Permission Enforcement and Role-Based Policy

**Date:** 2025-02
**Status:** Accepted (supersedes ADR-004)

All 12 core permissions are now **enforced** in the backend router via an
`authorize()` helper that checks each request against the Backstage permission
system. The frontend uses a `useKongPermissions` hook to conditionally
render mutation buttons.

A custom `KongPermissionPolicy` replaces the default allow-all policy. It maps
three user profiles (admin, operator, viewer) to three role groups
(kong-admins, kong-operators, kong-viewers) with increasing restrictions.

**Rationale:** The core CRUD is stable and tested. Adding enforcement now
completes the security model before moving to spec/Git integration.

## ADR-011: DEVPORTAL_USER Env Var for Local Profile Switching

**Date:** 2025-02
**Status:** Accepted

The guest auth provider is configured with
`userEntityRef: user:default/${DEVPORTAL_USER:-admin}`, allowing developers to
impersonate any user profile by setting a single environment variable.

**Rationale:** No real auth backend exists in the dev workspace. Rather than
building multi-user auth infrastructure, a simple env var lets developers
test all three permission profiles with a backend restart. The permission
policy, catalog entities, and auth identity all use the same user references,
so the full chain works end-to-end.

## ADR-012: Promotion Records Use a Surrogate PK plus an Idempotency Key

**Date:** 2026-09
**Status:** Accepted

The `promotions` table uses a surrogate integer primary key, a unique
`idempotency_key` column, and a nullable `mr_ref` set when the promotion
transitions to `mr-open`. The implementation plan originally described a
primary key that changed value from a provisional uuid to
`<project-id>-<mr-iid>` once the MR existed, while also serving as the
retry-dedupe key.

**Rationale:** Those two roles contradict each other — at promote time the MR
does not exist, so an MR-derived key cannot dedupe pre-MR retries, and a
mutating primary key complicates any later foreign key. The idempotency key is
server-generated on the first attempt; retry safety comes from the at-most-one
active promotion per (instance, route, plugin type) invariant, so a repeated
promote resumes the active record instead of opening a second MR.

## ADR-013: FileEdit Is a Two-Variant Type; the Ingress Annotation Is Not an Edit

**Date:** 2026-09
**Status:** Accepted

Adapters emit `FileEdit` values of exactly two kinds: `{ op: 'merge' }` into
`chart/values.yaml` and `{ op: 'create' }` of
`chart/templates/kongplugin-<type>.yaml`. The Ingress `konghq.com/plugins`
annotation is never a third edit — the golden-path chart's own Ingress
template composes it from whichever `kongPlugins.*` values keys are present.

**Rationale:** Keeps adapters pure functions of the live plugin config with no
chart context, and keeps the equivalence check (`renderCheck`) comparing the
one artifact that matters — the rendered `KongPlugin` manifest — rather than
chasing annotation formatting.

## ADR-014: MR Coordinates Ride the `detail` Column

**Date:** 2026-09
**Status:** Accepted

The promote endpoint packs the MR coordinates
(`{ host, projectSlug, projectId, iid }`) as JSON into the promotion record's
existing `detail` column at the `mr-open` transition; discard reads them back
to close the MR.

**Rationale:** Avoids a schema change for data only needed while a promotion
is discardable. Constraint on the finalizer (P4): it must not clobber `detail`
on any transition where the record can still be discarded; once the MR is
merged, `detail` is free for human-readable failure diffs.

## ADR-015: Finalizer Advances One State Per Tick and Leaves Coordinate-less Drafts Alone

**Date:** 2026-09
**Status:** Accepted

The promotion finalizer (P4) advances each active record at most one state per
scheduled tick — no same-tick chaining across `mr-open → awaiting-deploy →
applying → codified`. Drafts that crashed before any repo/MR coordinates were
persisted are never reaped: the route stays frozen via the active-promotion
lookup, and re-invoking promote resumes the same record. Teardown detection is
project-level only (project archived or 404); entity-level detection would
require an `entity_ref` column and is deferred until a concrete need.

Amendment to ADR-014: the promote endpoint now persists the repo coordinates
(`{ host, projectSlug, projectId }`) into `detail` immediately after repo
resolution — before the MR exists — so the finalizer's draft-orphan probe can
find an already-opened MR after a crash. ADR-014's constraint stands: the
finalizer never clobbers `detail` while the record is still discardable.

**Rationale:** One-state-per-tick keeps every transition individually
crash-safe and observable (worst case ~4 ticks ≈ 4 minutes at the default 60s
interval, which the spec's "no manual step" acceptance still satisfies).
Reaping coordinate-less drafts would require distinguishing "abandoned" from
"in flight", which the record cannot express; resuming on re-promote is the
safe recovery path.

## ADR-016: Promotion Preview Is a Side-Effect-Free Twin of Promote; `detail` Reaches the Client Only on Failure

**Date:** 2026-09
**Status:** Accepted

The promote flow gained a dry-run twin,
`POST .../plugins/:pluginId/promote/preview`: identical permission gate,
adapter lookup, chart materialization and renderCheck as promote, but no store
write, no branch/commit/MR, no Kong tagging. It returns the post-edit contents
of only the files the adapter's edits touch, plus the normalized config — this
is what the review dialog renders as the "generated YAML" side of the diff.
A renderCheck mismatch is `400` on preview (a validation outcome of the dry
run) while remaining `409` on promote (a conflict mid-flow).

The promotion DTO exposes `detail?: string` only when the record's state is
`failed-restored`; in every other state the column is omitted from responses.

**Rationale:** Synthesizing the generated YAML client-side would reimplement
`toChartEdits` and drift from what renderCheck actually verifies the moment an
adapter changes; the server is the single source of the rendered truth. The
`detail` column doubles as internal bookkeeping (ADR-014: MR coordinates while
discardable) — exposing it unconditionally would leak plumbing to the client,
so it crosses the API boundary only in the one state where it carries the
human-readable failure diff.

## ADR-017: Plugin Ownership Is Derived From Instance defaultTags, Not Stored

**Date:** 2026-09
**Status:** Accepted

Promotion only makes sense for a route plugin the portal itself created
("portal-managed") — not one reconciled onto Kong by an external controller
(e.g. the Kong Ingress Controller) from the service's chart ("code-owned").
Ownership is derived, not a stored field: an instance configuring
`kong.instances[].defaultTags` is treated as marking every entity it creates
with those tags (`KongServiceManagerService.tagsForCreate`), so a plugin is
portal-managed iff its own tags carry all of the instance's `defaultTags`.
An instance with no `defaultTags` configured has no ownership signal, so
every plugin on it is treated as promotable — today's behaviour, unchanged.

`resolvePromotableRoutePlugin` (shared by the promote and preview endpoints)
refuses a code-owned plugin with a `400`. The frontend mirrors the same
derivation in `derivePromotionBadge`: a route plugin with no promotion
history renders `code-owned` instead of `experimental` when it fails the
tag check, and `PluginCard` hides both Promote and Discard for it — read
only, same as a `codified` plugin, but without a promotion record.

**Rationale:** A stored ownership flag would need to be set at creation time
and kept in sync with tag edits made outside the portal; deriving it from
tags already present on every read keeps ownership a projection of Kong's
own state rather than a second source of truth that can drift from it. Tying
the signal to the same `defaultTags` the portal already writes at create
time (ADR predates this doc — see `KongInstanceConfig.defaultTags`) means an
operator who has not opted into tagging gets no gate at all, matching the
plugin's existing "stays unopinionated about coexistence strategy" stance.

## ADR-018: Helm Is a Declared Deployment Prerequisite, Detected at Startup

**Date:** 2026-09
**Status:** Accepted

`renderCheck` (ADR-013, used by both promote and preview) shells out to
`helm template` to verify a generated chart reproduces the live config. A
production deployment hit this as a `500 helm CLI not found on PATH` on the
preview endpoint — the portal image doesn't bundle helm, and that dependency
was never declared. `kong.promotion.helmPath` (default `helm`, resolved on
PATH) and `kong.promotion.helmTimeoutSeconds` make the prerequisite
explicit; the backend probes it once at startup, logs a warning naming the
configured path when it's missing, and gates `POST .../promote` and
`POST .../promote/preview` on the result — `503` with an actionable message
instead of a raw exec failure deep inside `renderCheck`. The gate re-probes
lazily on every gated request while unavailable, so a deployment that fixes
the prerequisite recovers without a backend restart, and stops re-probing
once healthy. `GET /:instance/promotion/capabilities` exposes the same
result so the frontend can disable "Promote to code" with the identical
message as a tooltip instead of letting the user hit the 503. Every `helm
template` invocation runs against a per-call scratch directory
(`HELM_CACHE_HOME`/`HELM_CONFIG_HOME`/`HELM_DATA_HOME`), since the portal
runs with a read-only root filesystem and helm's defaults for those write
under `$HOME`.

Options considered: bundling a pinned `helm` binary in the npm package (ties
a binary release to every plugin version bump, and gives the package
platform-specific variants); a from-scratch JS re-implementation of `helm
template` (large surface, permanent drift risk against real Helm semantics);
moving the render to CI instead of the backend (breaks the promote/preview
request-response cycle — the equivalence check is inline for a reason: a
mismatch aborts before any write). Declared prerequisite plus graceful
degradation keeps the real Helm engine (no semantic risk) while making the
dependency visible and the failure mode actionable instead of silent.

## ADR-019: "Deployed" Means a Successful GitLab Deployment, Not a Successful Pipeline

**Date:** 2026-09
**Status:** Accepted

The finalizer's `awaiting-deploy → applying` transition (design 02: "wait for
the merged deploy to succeed; never assume merge means applied") was keyed on
a *pipeline* with `status=success` for a commit at or after the merge. First
live promotion (2026-09-15): the golden-path pipeline carries a manual
`destroy` job with `allow_failure: false` — deliberately, so a refused destroy
cannot leave the pipeline green — and GitLab reports such a pipeline as
`manual` (blocked) forever, never `success`. The deploy job had succeeded, the
chart was applied, and the finalizer stayed parked; meanwhile the Kong Ingress
Controller could not create the code-owned plugin next to the still-present
experimental one (409, one plugin per type per route) and stopped syncing the
whole dataplane until an operator deleted the experiment by hand.

The primary signal is now the GitLab **deployments** API: a deployment of the
default branch with `status=success` created at or after `merged_at`
(`GitlabClient.listSuccessfulDeploymentsSince`). A deployment record is exactly
"the deploy job ran and finished", independent of sibling jobs; `created_at`
is when that job started, so a record at/after the merge deployed the merge
commit or a descendant. The pipeline check stays as a fallback for repos whose
deploy job declares no `environment:` and therefore records no deployments.

**Rationale:** pipeline status aggregates every job in the pipeline, so any
blocking manual job (teardown, approvals) makes it a wrong proxy for "was
deployed"; the deployments API is the object GitLab itself maintains for that
question. Residual edge: a manual re-run of an *older* pipeline's deploy job
after the merge also records a deployment — the finalizer then moves to
`applying`, and the existing `applyTimeoutMinutes` restore path (ADR-014)
handles a code-owned plugin that never converges. Prerequisite for services:
the deploy job must declare a GitLab `environment:` (the golden path does).

## ADR-020: Handover — the Experiment Is Removed at Merge and Never Coexists With the Code-Owned Plugin

**Date:** 2026-09
**Status:** Accepted

Invariant: **once the promoted chart is on the default branch, the
experimental plugin must not exist on the route.**

The finalizer used to delete the experiment in `applying` — i.e. *after* CI
had deployed the merged chart. Kong allows one plugin instance per (type,
route), so between that deploy and the next finalizer tick the ingress
controller got a `409` uniqueness violation creating the code-owned plugin;
on a db-backed Kong that failure aborts the whole configuration sync, not
just the one plugin, and the dataplane keeps serving the last good config
until someone deletes the experiment by hand. Observed in production
(2026-09-15) as a route returning 504 — the same incident ADR-019 documents
from the other side, where the finalizer stayed parked because pipeline
status never turned green and so never reached its delete step at all.

What changed:

- `mr-open` → `awaiting-deploy` deletes the experimental plugin **first**,
  then transitions, recording `experimentRemovedAt` beside `mergedAt` and
  `parkedSince`. The delete is idempotent: a crash between it and the
  transition leaves the record in `mr-open`, and the next tick finds nothing
  to delete and transitions anyway. The `closed` → `discarded` branch is
  unchanged — before the merge the experiment legitimately stays live.
- `awaiting-deploy` has no timeout and no restore. A merged-but-never-deployed
  chart simply stays parked: the route runs without the plugin because its
  owner merged the chart that removes it, and the badge says so.
- `applying` no longer deletes anything, and a record that exceeds
  `applyTimeoutMinutes` becomes `failed` — a new terminal state carrying an
  actionable `detail` — instead of restoring the experiment. Restoring after
  the merge is precisely what caused the incident: the recreated plugin
  collides with the code-owned one on the controller's next sync.
- `failed-restored` remains in the state enums so stored records keep
  parsing, but nothing produces it any more.

Amendment to ADR-016: `detail` crosses the API boundary on **both** failure
states (`failed` and the legacy `failed-restored`), not only the latter.

Amendment to ADR-019: the residual edge in its last paragraph — a manual
re-run of an older pipeline's deploy job records a deployment, so the record
advances to `applying` before the merge is really out — now ends in `failed`
rather than in a restore.

**Residual race:** a deploy that lands before the finalizer has seen the
merge still collides for at most one tick, and self-heals as soon as that
tick deletes the experiment. Deployments whose pipelines are fast should set
`kong.promotion.reconcileIntervalSeconds: 30` to shrink the window.

**Rationale:** the merge is the earliest moment at which the route's owner
has committed to the code-owned plugin, and it is strictly before anything
can deploy it — so it is the only point where the delete cannot race the
controller. Options considered: keeping restore-after-merge but tagging the
recreated plugin so the controller ignores it (Kong's uniqueness constraint
is on (type, route) regardless of tags, so the collision stands); deleting
the experiment at promote time, before review (leaves the route unprotected
for the entire review window, and every closed MR would have to recreate it);
keeping the restore but gating it on the code-owned plugin being absent
(a check that is racy by construction — the controller can create it a
millisecond later).

## ADR-021: A Terminal Promotion Record Describes a Plugin That No Longer Exists; the Badge Must Not Outlive It

**Date:** 2026-09
**Status:** Accepted

Promotion records are keyed by (instance, route, plugin type), not by Kong
plugin id (ADR-012). A terminal record (`codified`, `failed`) therefore stays
attached to the *type* after the plugin it describes is gone: the code-owned
plugin removed from the chart, or the experiment deleted at merge (ADR-020).
Observed 2026-09-16: after the promoted `rate-limiting` was dropped from a
service's chart, a fresh `rate-limiting` experiment on the same route rendered
as "Codificado · 16h" and lost its Promote button.

Decision: the frontend derives the badge from the record **and** the live
plugin's ownership (ADR-017). When the latest record is terminal and the live
plugin carries the instance `defaultTags`, the record is stale and the plugin
is a plain experiment. Active records (`draft`, `mr-open`, `awaiting-deploy`,
`applying`) still win — a frozen experiment is the plugin itself. Instances
with no `defaultTags` have no way to tell the cases apart and keep the old
behaviour.

Rejected: storing the plugin id on the record (Kong ids change when an
experiment is recreated; the type/route key is what the finalizer needs);
reaping terminal records server-side when the plugin disappears (a
finalizer tick per codified record forever, for a purely visual problem).

## ADR-024: Edit in Code — a `code-only` Promotion Mode With No Experiment in Kong

**Date:** 2026-09
**Status:** Accepted

A code-owned plugin (ADR-017: reconciled onto Kong by an external
controller from the service's chart, not created by the portal) was
read-only — the only path to changing it was editing the chart by hand.
Issue #135 adds "edit in code": the user edits the config in the existing
plugin form, and the backend opens a merge request with the edited config
directly, gated by `kong.promotion.editInCode`.

The `promotions` table gains a nullable `mode` column
(`'experiment' | 'code-only'`, migration `20260916010000_promotions_mode.js`,
defaulting a null/missing value to `'experiment'` so a backend from before
this change keeps reading its own rows unchanged). A `code-only` record's
`config_snapshot` is the *edited* config (`adapter.fromRendered({ config })`
on the client's `config` body field), not the live one — render-check runs
against that snapshot instead of the live plugin's. Every Kong write the
`experiment` mode makes — tagging the plugin (Step 4 of promote), untagging
it on a closed MR, deleting it at merge, restoring it on teardown — is
skipped for `code-only`: none of those things ever happened, because no
experiment was ever created. The finalizer's `isCodeOnly()` guards exactly
those three write sites; `handleApplying`'s convergence check only reads
Kong and needed no change.

**Ownership check reused as-is (ADR-017), not the KIC tag.** The gate is
`resolvePromotableRoutePlugin`'s existing `defaultTags` derivation — the
same one the frontend's `derivePromotionBadge` already keys its `code-owned`
badge on — not the Kong Ingress Controller's `managed-by-ingress-controller`
tag. The two signals usually agree, but only the `defaultTags` derivation is
visible to the frontend; gating the backend on the KIC tag instead would let
a card show "Edit in code" for a plugin the backend then rejects. Corollary:
an instance with no `defaultTags` configured has no ownership signal at all
(ADR-017), so `editInCode` can never fire there — every plugin reads as
portal-managed.

**A `code-only` request never resumes an active record.** The `experiment`
flow resumes an in-flight draft by (instance, route, plugin type) so a
retried promote doesn't open a second MR (ADR-012). Resuming for
`code-only` would either take the Step-4 branch of whatever mode the
stale record was actually in, or silently promote a snapshot from a
previous edit instead of the config the user just submitted. An active
record of *either* mode for the same route/type is therefore always a 409
for a `code-only` request, with the MR link when one exists — the same
freeze wording `assertNotFrozen` already uses elsewhere. `experiment`
promotes keep the pre-existing resume behaviour unchanged.

**Promote refuses a no-op edit (409); preview stays permissive.** An edited
config that normalizes identically to the live config has nothing to
promote — promote 409s before writing a draft. Preview's job is to show
the generated YAML for whatever the user typed, including a config that
happens to match live, so it runs the equivalence render-check but skips
the no-op comparison (ADR-016 precedent: promote and preview already differ
on status for the same renderCheck mismatch, 409 vs. 400).

**MR title/description/commit message name the mode.** A `code-only` MR
says it edits an already code-owned plugin directly and that there is no
experiment to remove — the reviewer reading the MR shouldn't have to infer
that from the diff alone.

Rejected: keying the mode off the KIC tag instead of `defaultTags` (drifts
from what the frontend can see, per above); recreating a shadow experiment
in Kong for `code-only` so the existing finalizer logic needs no `mode`
branch (defeats the point — the plugin already exists and works, tagging
and possibly clashing with it serves no purpose); letting `code-only`
resume an active record like `experiment` does (silently promotes a stale
edit, per above).
