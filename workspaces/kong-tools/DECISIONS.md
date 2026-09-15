# Plugin Decision Records

Workspace-local design decisions for `kong-tools`, numbered `PDR-001`, `PDR-002`, … and
cited outside this workspace as `kong-tools PDR-NNN`. They are plugin decision records, not
ADRs: decisions with cross-workspace or lasting weight live in the planning repository
`veecode-platform/devportal-plugins-parent` as `plugins ADR-NNNN`. Entries 001–015 were
written as `ADR-NNN` and renamed on 2026-09-14; new entries start at `PDR-017`.

Entries 001–011 were taken during the migration of the kong-service-manager plugins from
[platform-backstage-plugins](https://github.com/veecode-platform/platform-backstage-plugins)
to the `@veecode-platform/backstage-plugin-kong-service-manager-*` packages; 012–015 during
the promote-to-code feature (P1–P4, 2026-09).

## PDR-001: New Backstage Backend System

**Date:** 2025-01
**Status:** Accepted

The old plugin supported both the legacy (`createRouter`) and new backend
systems. The new implementation targets **only** the new Backstage backend
system (`createBackendPlugin`).

**Rationale:** The legacy backend system is deprecated. Shipping only the new
system reduces maintenance surface and aligns with Backstage direction.

## PDR-002: Drop Controller Layer

**Date:** 2025-01
**Status:** Accepted

The old backend used a controller layer (`KongController`, `ServiceController`,
`RoutesController`, `PluginsController`) that mixed permission checks with
request handling.

The new backend uses a flat **router + service** pattern: the Express router
handles HTTP concerns and Zod validation, then delegates to
`KongServiceManagerService` for Kong Admin API calls.

**Rationale:** Simpler code, fewer abstractions. Permission enforcement is
deferred to a later phase (see PDR-004) and will be added as middleware, not
embedded in controllers.

## PDR-003: Zod Validation on All Mutation Endpoints

**Date:** 2025-01
**Status:** Accepted

Every POST/PATCH/DELETE endpoint validates path params and request body with
Zod schemas before calling the service layer.

**Rationale:** Catches malformed requests early, provides clear error messages,
and serves as living documentation for the API contract.

## PDR-004: Defer Permission Enforcement

**Date:** 2025-01
**Status:** Superseded by PDR-010

The 12 core permissions are **defined** in the common library but are **not
enforced** in the backend router yet. Enforcement is planned for Phase 6.

**Rationale:** Get the core CRUD working and tested first. Permissions add
complexity that is easier to layer on once the base is stable.

## PDR-005: Simplified Permission Set

**Date:** 2025-01
**Status:** Accepted

The old implementation defines 22 permissions including per-category plugin
permissions (AI, Auth, Security, etc.) and spec permissions. The new
implementation starts with 12 core permissions covering read/write for
services, routes, and plugins.

**Rationale:** Category-level permissions are a power-user feature. Starting
with a smaller, simpler set reduces initial complexity. Additional permissions
can be added in Phase 9 without breaking changes.

## PDR-006: Defer OpenAPI Spec and Git Integration

**Date:** 2025-01
**Status:** Accepted

The old plugin includes a full OpenAPI spec viewer with Git-based PR workflows
(GitHub and GitLab providers). This is **not** included in the initial
migration.

**Rationale:** The spec/Git integration is the most complex feature in the old
plugin and touches external systems (GitHub API, GitLab API). Deferring it
lets us ship a solid core faster. Planned for Phases 7-8.

## PDR-007: Context-Based State Management

**Date:** 2025-01
**Status:** Accepted

The frontend uses a single React Context with `useReducer` for global state
management (`KongServiceManagerContext`), rather than per-component local
state or a third-party state library.

**Rationale:** Keeps dependencies minimal. The plugin state is modest in size
(one service, its routes, its plugins) and fits well in a single context.
The reducer pattern makes state transitions explicit and testable.

## PDR-008: Plugin Category Mapping in Frontend Client

**Date:** 2025-01
**Status:** Accepted

The mapping of Kong plugin names to UI categories (authentication, security,
traffic-control, etc.) lives in the frontend `KongServiceManagerClient`, not
in the backend or common library.

**Rationale:** This is purely a UI concern. The backend returns raw Kong data;
the frontend decides how to present it. If the mapping needs to be shared
later (e.g., for category-level permissions), it can be moved to common.

## PDR-009: Single Package for Frontend Plugin

**Date:** 2025-01
**Status:** Accepted

Unlike some Backstage plugins that split into `-react` (hooks/context) and
main (components) packages, kong-service-manager ships as a single frontend
package.

**Rationale:** The plugin is self-contained. There is no need for other
plugins to consume its hooks or context. A single package is simpler to
publish and consume.

## PDR-010: Permission Enforcement and Role-Based Policy

**Date:** 2025-02
**Status:** Accepted (supersedes PDR-004)

All 12 core permissions are now **enforced** in the backend router via an
`authorize()` helper that checks each request against the Backstage permission
system. The frontend uses a `useKongPermissions` hook to conditionally
render mutation buttons.

A custom `KongPermissionPolicy` replaces the default allow-all policy. It maps
three user profiles (admin, operator, viewer) to three role groups
(kong-admins, kong-operators, kong-viewers) with increasing restrictions.

**Rationale:** The core CRUD is stable and tested. Adding enforcement now
completes the security model before moving to spec/Git integration.

## PDR-011: DEVPORTAL_USER Env Var for Local Profile Switching

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

## PDR-012: Promotion Records Use a Surrogate PK plus an Idempotency Key

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

## PDR-013: FileEdit Is a Two-Variant Type; the Ingress Annotation Is Not an Edit

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

## PDR-014: MR Coordinates Ride the `detail` Column

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

## PDR-015: Finalizer Advances One State Per Tick and Leaves Coordinate-less Drafts Alone

**Date:** 2026-09
**Status:** Accepted

The promotion finalizer (P4) advances each active record at most one state per
scheduled tick — no same-tick chaining across `mr-open → awaiting-deploy →
applying → codified`. Drafts that crashed before any repo/MR coordinates were
persisted are never reaped: the route stays frozen via the active-promotion
lookup, and re-invoking promote resumes the same record. Teardown detection is
project-level only (project archived or 404); entity-level detection would
require an `entity_ref` column and is deferred until a concrete need.

Amendment to PDR-014: the promote endpoint now persists the repo coordinates
(`{ host, projectSlug, projectId }`) into `detail` immediately after repo
resolution — before the MR exists — so the finalizer's draft-orphan probe can
find an already-opened MR after a crash. PDR-014's constraint stands: the
finalizer never clobbers `detail` while the record is still discardable.

**Rationale:** One-state-per-tick keeps every transition individually
crash-safe and observable (worst case ~4 ticks ≈ 4 minutes at the default 60s
interval, which the spec's "no manual step" acceptance still satisfies).
Reaping coordinate-less drafts would require distinguishing "abandoned" from
"in flight", which the record cannot express; resuming on re-promote is the
safe recovery path.

## PDR-016: Two Ways of Applying Changes to Kong, With No Default

**Date:** 2026-09-10 (owner decision); recorded here 2026-09-15
**Status:** Accepted
**Deciders:** André Fernandes (program owner), Giovani Corrêa

This plugin lets a developer manage Kong from the portal: create routes, enable and disable
Kong plugins on a service. It does that today by calling Kong's Admin API directly, which
requires a Kong running in database-backed mode.

Many teams run Kong differently. The gateway's configuration is generated from files or
Kubernetes resources kept in Git, and an automated process applies them through Kong's Ingress
Controller, decK or similar. In that model the gateway either rejects direct writes
(database-less mode) or an automated sync overwrites them, so the same button in the portal is
"works instantly" for one customer and "does nothing" for another.

**Decision:**

1. The plugin supports **two write paths**: direct writes to the Admin API, immediate, for
   database-backed gateways; and export of the same change as declarative artifacts
   (Kubernetes resources or configuration files) for teams that manage Kong from Git.
2. The plugin ships **no default and enforces neither path**. The documentation describes both
   with their requirements and trade-offs, and the team deploying the portal recommends a path
   for its own context.
3. Every entity the plugin creates through the Admin API carries a distinctive, configurable
   tag, so an automated sync scoped by its own tags leaves portal-created entities alone. This
   is the coexistence convention Kong's own tooling uses.
4. This workspace carries a deployment blueprint, the "which path fits my setup" guide, written
   for readers with no prior context: [`docs/applying-changes-to-kong.md`](docs/applying-changes-to-kong.md).

**Evidence gathered before deciding** (research 2026-09-10, primary sources): Kong's Ingress
Controller only reconciles entities carrying its own tag, `managed-by-ingress-controller` by
default, and preserves entities another tool created with a different tag, verified in the
controller's source (KIC 3.x, `go-database-reconciler`) and a mechanism present since 2019
(issues #105, #219, #246). decK documents the same pattern with `select_tags`, which "ignores
any resources that don't have that tag", and Kong's federated-configuration guide builds on it.
Kong's own commercial product, Konnect, enforces no lock between its UI, the Admin API and
decK; coexistence there is also convention by tags. Across the gateway market the surviving
patterns are read-only UIs or UIs that write through the declarative pipeline; UIs writing to
the same store as an automated sync with no safeguard are discouraged even by their own
communities, for example the APISIX Dashboard.

**Rationale:** one plugin serves both operating models instead of two forks, the
experiment-then-promote workflow becomes possible, and no customer is forced to change how they
operate Kong. The trade-offs are real and accepted: the tag convention is cooperative rather
than enforced, since Kong has no ownership concept, so a misconfigured sync that scopes no tags
can still wipe portal entities; and supporting two paths costs more documentation and, once
export lands, more code.

**Alternatives considered:** an opinionated default, with the plugin recommending one path,
rejected by the program owner because deployers know their own context, so the plugin documents
and the deployer recommends. Admin API only, the status quo, rejected because it excludes every
customer running Kong database-less behind an ingress controller, including VeeCode's own
internal portal. Declarative export only, rejected because it loses the instant feedback that
makes the portal useful as an experimentation surface and punishes customers already running
database-backed Kong.

**Follow-ups:** the declarative-export feature design, and name-collision handling between
portal-created routes and Git-managed ones. The deployment blueprint named above has since been
written.
