# 0009. Four named proofs and the official test flow

- **Status**: Accepted (owner decision, 2026-09-17)
- **Date**: 2026-09-17
- **Deciders**: Giovani Corrêa (decision), André Fernandes (ratification)
- **Supersedes**: — (amends [0003](0003-dummy-workspace-is-the-reference-implementation.md) §3: the harness is sized to the package roles, §5 below, instead of "hosting app by default")
- **Superseded by**: —
- **Moved**: from `devportal-plugins-parent` `docs/adr/` to this repository on 2026-09-22, under [parent ADR-0007](https://github.com/veecode-platform/devportal-plugins-parent/blob/main/docs/adr/0007-rules-live-with-the-code-parent-keeps-business-decisions.md) §1 (a rule lives in the repository whose code it governs). Number kept, so `plugins ADR-NNNN` citations stay valid; history before the move is in [the parent](https://github.com/veecode-platform/devportal-plugins-parent/blob/47ab25b/docs/adr).

## Context

"I tested the plugin" means four different things today: the workspace dev app, a
per-workspace compose mounting `dist-dynamic`, `/publish` + `/smoketest` in the overlays,
or Drydock. The six per-workspace composes disagree: `dummy` and `kong-tools` run
`veecode/devportal:latest`, which on 2026-09-17 resolves to `2.2.3` (the 2.x line), with
`/app/...` paths; `gitlab-pipelines` hardcodes `3.0.0-beta.7` with
`/opt/app-root/src/...` paths. `devportal-local` pins the `3.0.0-beta.7` digest (two chart
releases behind), keeps `dynamic-plugins-root` as an internal volume and offers no way to
load a local export.

Upstream separates four proofs and never lets one stand in for another: the workspace dev
app; `rhdh-local` loading a local `plugin export --dev --dynamic-plugins-root` through a
compose override that mounts a host folder; the overlays smoke on the published OCI
artifact; and product E2E in OpenShift on already-published images (their "Local OCI
Testing" is *not* local development). The overlays repo holds recipes only — no source, no
dev app, no code tests.

## Decision

1. Four proofs, each named, each answering one question; no proof substitutes another:
   **Proof 1 · Code** (the plugin works as a package: dev app, unit, Playwright) ·
   **Proof 2 · Exported** (the `dist-dynamic` loads and renders in a real portal, without
   publishing) · **Proof 3 · Artifact** (the published OCI image installs and boots: overlay
   smoke) · **Proof 4 · Product** (the user journey works in the delivered portal).
2. The official flow, repeated in every workspace `AGENTS.md`: **build in
   `devportal-plugins`, prove in `devportal-local`, publish through `export-overlays`.**
   Proof 1 in the workspace, proof 2 in the runner, proof 3 in the overlay, proof 4 back in
   the runner with the published artifact.
3. **`devportal-local` is the only runner for proofs 2 and 4** (platform side in
   `devportal-planning` ADR-013). Each workspace gains `yarn dev:dynamic`, which exports
   with `plugin export --dev --dynamic-plugins-root $DEVPORTAL_LOCAL_DIR/dynamic-plugins-root`
   and prints the compose command; `DEVPORTAL_LOCAL_DIR` comes from the environment or
   from the `devportal-context` skill. The per-workspace composes are removed. Exception:
   `ldap-auth` keeps a compose for its LDAP fixture (§5).
4. **The overlay is a distribution recipe, never a development environment.** Third-party
   adaptations are developed in a checkout of the origin with the patch applied, proven
   with proofs 1 and 2, then registered back as a patch. No development automation enters
   the overlays fork; the V3 minimal-drift discipline applies to overlays and utils as to
   the core.
5. **Harness sized to the role**, keyed by `backstage.role` in each package's
   `package.json` (present in all 35 packages):

   | `backstage.role` | Harness in the workspace | Minimum proof 2 before publishing |
   |---|---|---|
   | `frontend-plugin` (page, card, header) | `packages/app` + Playwright | route renders in devportal-local |
   | `frontend-plugin` theme | `packages/app` | app loads with the theme, no console error |
   | `frontend-plugin` scaffolder field extension | `packages/app` + example template | the template form renders the field |
   | `backend-plugin` | `packages/backend` + unit | `/api/<id>/health` answers |
   | `backend-plugin-module` catalog (ai-resources, aws-s3-catalog) | `packages/backend` with host plugin + fixtures | an example entity is ingested |
   | `backend-plugin-module` scaffolder (kong) | `packages/backend` | action listed in `/api/scaffolder/v2/actions` |
   | `backend-plugin-module` auth (ldap-auth) | `packages/backend` + LDAP fixture in compose | a test sign-in completes |
   | `common-library` | unit | none; proven by its consumers |

   Consequence: ai-resources and aws-s3-catalog gain `packages/backend`; marketplace gains
   app and backend; the two themes gain `packages/app`. "Every workspace has a harness
   sized to its plugin type", not "every workspace has a hosting app".
6. **Playwright: one suite, two targets.** `PLAYWRIGHT_TARGET=dev` starts the workspace
   dev app (`webServer: yarn start`) — proof 1, cheap, runs on every PR. `PLAYWRIGHT_TARGET=local`
   runs the same specs against `devportal-local` on `localhost:7007` with the exported or
   published plugin — proof 4, catches dynamic-loading defects the dev app cannot (the
   kong-tools pt-BR gap: translations rendered in the dev app and were silent in the portal).
7. Drydock is out of the flow (stale). Upstream `rhdh-e2e-test-utils` is not adopted (it
   requires OpenShift and Keycloak); its metadata-resolution module may be copied later
   with the overlays fork sync, which is a separate PR.

## Consequences

- **Positive**: a PR can say "proofs 1 and 2 green, 3 pending" and everyone knows what is
  missing; one runtime, identical to the product, for every family; image pinning moves
  out of sixteen composes into one runner.
- **Negative / trade-offs**: the runner must be cloned next to the monorepo; first `up`
  takes about two minutes (Postgres + installer). Themes and libraries may legitimately
  ship with zero tests; that exemption is written in their `AGENTS.md`.
- **Follow-ups**: `yarn dev:dynamic` in the template; remove six composes; add the four
  missing harnesses; LDAP fixture image and boot time to verify; confirm the v3 image path
  layout (`/opt/app-root/src/dynamic-plugins-root`) before deleting the old composes.

## Alternatives considered

- **Keep a compose per workspace, standardised** — a second runtime nobody keeps equal
  to the product; exactly what produced three image tags.
- **Only test in `devportal-local`, drop Playwright in the dev app** — every UI test would
  need Docker, including in CI; loses the fast "I broke the component" signal.
- **Adopt `rhdh-e2e-test-utils`** — cluster-bound (OpenShift, `oc`, `helm`, Keycloak).
