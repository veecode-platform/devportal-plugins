# Kong Service Manager - Migration Roadmap

Migration from [platform-backstage-plugins](https://github.com/veecode-platform/platform-backstage-plugins/tree/master/plugins)
to the new `@veecode-platform/backstage-plugin-kong-service-manager-*` packages.

## Guiding Principles

- **Incremental releases** - ship working slices, not a big-bang migration.
- **Simplify first** - drop legacy patterns; adopt Backstage new backend system,
  Zod validation, and simpler state management from day one.
- **Defer complexity** - OpenAPI spec/Git integration, category-level permissions,
  and advanced UI polish come in later phases.

## Phase 1 - Core Read-Only (v0.1.0) ✅ DONE

Minimum viable plugin: display Kong service information and associated
plugins/routes for a catalog entity.

| Deliverable | Status |
|---|---|
| Backend plugin (new backend system) | ✅ |
| Common library (types, annotations, API interface) | ✅ |
| Frontend plugin skeleton (plugin, apiRef, client) | ✅ |
| Service info page | ✅ |
| List routes for a service | ✅ |
| List service-level plugins | ✅ |
| Multi-instance support + instance selector | ✅ |
| Health endpoint | ✅ |
| 12 core RBAC permissions | ✅ |
| Example catalog entities | ✅ |
| Backend README | ✅ |

## Phase 2 - Service Plugin CRUD (v0.2.0) ✅ DONE

Full create/read/update/delete for plugins on a service.

| Deliverable | Status |
|---|---|
| Backend: add/edit/remove service plugin endpoints | ✅ |
| Backend: get plugin schema fields endpoint | ✅ |
| Frontend: PluginConfigDrawer (JSON config editor) | ✅ |
| Frontend: add/edit/delete plugin actions in PluginsList | ✅ |
| Zod validation on all mutation endpoints | ✅ |

## Phase 3 - Route CRUD (v0.3.0) ✅ DONE

Full create/read/update/delete for routes on a service.

| Deliverable | Status |
|---|---|
| Backend: create/edit/remove route endpoints | ✅ |
| Frontend: RouteForm dialog (protocols, methods, paths, hosts, flags) | ✅ |
| Frontend: delete route confirmation | ✅ |

## Phase 4 - Route Plugin CRUD (v0.4.0) ✅ DONE

Manage plugins scoped to individual routes.

| Deliverable | Status |
|---|---|
| Backend: route-scoped plugin endpoints | ✅ |
| Frontend: route plugin management in UI | ✅ |

## Phase 5 - Testing, Docs & Polish (v0.5.0) ✅ DONE

Harden the implementation before adding new features.

| Deliverable | Status |
|---|---|
| Frontend plugin README | ✅ |
| Common library README | ✅ |
| Backend unit tests (router, service) | ✅ |
| Frontend unit tests (components, context, client) | ✅ |
| Integration tests with mock Kong | ⏭️ skipped |
| Error handling review and UX improvements | ✅ |
| Loading states and skeleton screens | ✅ |
| Empty states for no routes/plugins | ✅ |
| Accessibility audit (a11y) | ⏭️ deferred |

## Phase 6 - Permission Enforcement (v0.6.0) ✅ DONE

Wire permissions into the backend router and frontend UI.

| Deliverable | Status |
|---|---|
| Backend: permission checks on all endpoints | ✅ |
| Frontend: hide/disable actions based on permissions | ✅ |
| Backend: permission matrix integration tests (48 cases, 3 roles) | ✅ |
| Role-based permission policy module (replaces allow-all) | ✅ |
| Org catalog with admin/operator/viewer users and groups | ✅ |
| Playwright E2E permission visibility tests | ✅ |
| Documentation on RBAC setup | ⏭️ deferred |

## Phase 7 - OpenAPI Spec Integration (v0.7.0) 🔜 NEXT

Migrate the spec viewing and Git-based spec management from the old plugin.

| Deliverable | Status |
|---|---|
| Common: spec-related types (ISpec, IKongPluginSpec, etc.) | 🔲 |
| Common: `kong-manager/spec` annotation | 🔲 |
| Common: spec permissions (read, update) | 🔲 |
| Backend: spec-related endpoints (if needed) | 🔲 |
| Frontend: SpecList component | 🔲 |
| Frontend: spec content viewer | 🔲 |
| Frontend: plugin association with spec paths | 🔲 |

## Phase 8 - Git Integration (v0.8.0)

PR-based workflow for spec changes via GitHub/GitLab.

| Deliverable | Status |
|---|---|
| Frontend: GitManager abstraction | 🔲 |
| Frontend: GitHub provider (Octokit) | 🔲 |
| Frontend: GitLab provider | 🔲 |
| Frontend: PR creation UI for spec changes | 🔲 |

## Phase 9 - Advanced Permissions (v0.9.0)

Category-level plugin permissions from the old implementation.

| Deliverable | Status |
|---|---|
| Common: category-level permissions (AI, Auth, Security, etc.) | 🔲 |
| Backend: category-level permission enforcement | 🔲 |
| Frontend: category-level permission gating | 🔲 |

## Future / Under Discussion

- Consumer management
- Upstream/target management
- Kong Konnect integration
- Dashboard with service health metrics
- Plugin configuration templates / presets
- Bulk operations (enable/disable multiple plugins)
- `KongInstancePicker` scaffolder field extension (dropdown backed by `GET /instances`) ✅
