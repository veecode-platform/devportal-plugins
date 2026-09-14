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
