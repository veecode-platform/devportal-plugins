# Context — VeeCode DevPortal plugins program

Glossary for the plugin monorepo and the people and agents who work in it. Pure vocabulary: how things work lives in `CONTRIBUTING.md`, each workspace's `AGENTS.md`, and `docs/adr/`. Platform-level terms (image, chart, cutover) live in `devportal-planning/CONTEXT.md`; the two glossaries reference each other and never restate.

## Language

### Structure

**Workspace**:
A family of related plugins under `workspaces/<name>/` with its own dependencies, lockfile, release, dev shell, `AGENTS.md` and decisions. The unit of everything in this repo.
_Avoid_: project, package (for the folder), "agent workspace" (see next entry)

**Agent workspace**:
The folder a person opens an agent in — several repositories side by side. Not a plugin workspace; when both appear in one sentence, say "monorepo workspace" and "agent workspace".

**Router**:
The thin root layer (`AGENTS.md` plus the `devportal-workspace` skill) whose only job is to send an agent to the affected workspace and its rules. The root knows no plugin.
_Avoid_: index, hub

**Product**:
What ships to a portal: the packages under `plugins/`, exported as dynamic plugins.
_Avoid_: source (too broad)

**Dev shell**:
The `packages/app` and `packages/backend` of a workspace: a throwaway Backstage that exists only to run and prove the product locally. Holds fixtures, wiring and dev configuration; never anything the product needs. Test: delete it and the export is still complete.
_Avoid_: hosting app, harness app, example app

**Harness**:
The set of dev shell, fixtures and test configuration a workspace needs, sized to the roles of its packages (`backstage.role`). A theme's harness is not a backend module's.
_Avoid_: test environment, sandbox

**Role**:
The `backstage.role` field of a package (`frontend-plugin`, `backend-plugin`, `backend-plugin-module`, `common-library`, …). Decides the harness and the minimum proof before publishing.

**PDR (plugin decision record)**:
A decision recorded in a workspace's `DECISIONS.md`, numbered `PDR-NNN`, binding only that family. A decision that binds every workspace is an ADR in `docs/adr/`.
_Avoid_: calling a PDR an ADR

### Proving a plugin

**Proof 1 · Code**:
Evidence that the plugin works as a package: unit tests and Playwright against the dev shell. Says nothing about dynamic loading.

**Proof 2 · Exported**:
Evidence that the exported `dist-dynamic` loads and renders in a real portal, without publishing anything. Runs in the local runner with the export mounted from disk.

**Proof 3 · Artifact**:
Evidence that the published OCI image installs and boots in a portal: the overlay smoke test. Only loading and health; no user journey.

**Proof 4 · Product**:
Evidence that the user journey works in the delivered portal: Playwright against the local runner with the exported or published plugin. Catches what the dev shell cannot (dynamic mount points, translations, real config).

**Official flow**:
"Build in `devportal-plugins`, prove in `devportal-local`, publish through `export-overlays`." Proof 1 in the workspace, 2 in the runner, 3 in the overlay, 4 back in the runner. No proof substitutes another.

**Local runner**:
`devportal-local`: the product running on a laptop, with the image the pinned chart points at. The only place proofs 2 and 4 run.
_Avoid_: rhdh-local (that is Red Hat's), sandbox, local portal

**Export**:
Turning a plugin package into its dynamic form (`dist-dynamic`) with the Red Hat Developer Hub CLI. Happens locally for proof 2 and in the overlay pipeline for proof 3.
_Avoid_: build (ambiguous), package (verb)

### Versions and delivery

**Host version**:
The Backstage version the DevPortal image ships, declared in `devportal-core`'s `backstage.json` on `main`. The compatibility contract every workspace pins in its own `backstage.json`.
_Avoid_: portal version, image version (an image tag is not a Backstage version)

**Pin**:
A consumer's explicit declaration of what it consumes (`backstage.json`, a chart digest, `versions.json`). A pin is bumped by pull request, never by propagation.

**Bump path**:
The way a consumer moves its pin forward: a workflow or bot that opens a pull request a human merges. A consumer without a bump path is a defect; a consumer that lags is normal.

**Lead the host**:
A workspace pinning a Backstage version newer than the host's. Never allowed; lagging is allowed.

**Edge**:
The moving alias of the 3.x image line (`veecode/devportal:edge`), the next portal. Opt-in for testing ahead; never the default. See `devportal-planning/CONTEXT.md` for the image line.

**Latest (frozen)**:
`veecode/devportal:latest`: frozen on the 2.x line, never a 3.x target, to be retired when 2.x leaves support. Any reference to it in this repo is a defect.

**Overlay recipe**:
A workspace in `export-overlays`: source commit, package list, patches, `Package` metadata and marketplace entity. Describes how an origin becomes a published plugin; holds no code and no dev environment.
_Avoid_: overlay (alone, ambiguous with source overlays), export config

**Publish**:
Producing the versioned OCI artifact and catalog index from an overlay recipe. Automatic on merge; needs no human. The only delivery channel; npm is not one.
_Avoid_: deploy, release (for this step)

**Promote**:
Moving a pointer that live instances consume (`plugin-catalog-index:latest`). Manual and human-approved, always.
_Avoid_: publish

**Deploy**:
What a portal operator does with a published artifact or index. Not something this repo does.

**Changeset**:
The file a change carries to declare which package it affects and how (patch, minor, major), chosen by the change's intent. Drives the version bump and the changelog; does not publish anything.

**Version Packages PR**:
The pull request that folds pending changesets into version bumps and a changelog; its merge is the human gate on the monorepo side.
