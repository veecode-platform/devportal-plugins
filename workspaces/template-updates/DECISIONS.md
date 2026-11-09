# Workspace decisions

## PDR-001: Scaffold the shell for the backend module role

**Status:** Accepted

**Context:** `scripts/create-workspace.js` supports `frontend-plugin` and
`backend-plugin`, while this product is a Scaffolder `backend-plugin-module`.
The workspace template's backend shell already includes the Scaffolder backend.

**Decision:** Generate the dev shell with the official `backend-plugin`
`--shell-only` scaffold, then add the module package using the existing
Scaffolder module shape, including its package-level ESLint configuration. Keep
the module under `plugins/` and register it in the dev shell backend.

**Consequence:** The product package and the shell have different roles. The
workspace `AGENTS.md` records the role-specific proof and commands.

## PDR-002: Seed the new lockfile from the host-line workspace

**Status:** Accepted

**Context:** A fresh Yarn resolution failed because the resolved graph
referenced an unavailable local patch for `got@11.8.2`. Seeding from the existing
host-line workspace lock let Yarn resolve and write this workspace's own lock.

**Decision:** Start from the current host-line lockfile, then install and dedupe
inside this workspace. Commit the resulting lockfile only with this workspace.

**Consequence:** New transitive dependencies are resolved and recorded in the
workspace lockfile; no patch file or shared scaffold change is required.
