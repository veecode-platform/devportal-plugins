# 0010. Plugins are published only through the export overlays; the npm publish flow is retired

- **Status**: Accepted (owner decision, 2026-09-17)
- **Date**: 2026-09-17
- **Deciders**: Giovani Corrêa (decision), André Fernandes (ratification)
- **Supersedes**: —
- **Superseded by**: —
- **Moved**: from `devportal-plugins-parent` `docs/adr/` to this repository on 2026-09-22, under [parent ADR-0007](https://github.com/veecode-platform/devportal-plugins-parent/blob/main/docs/adr/0007-rules-live-with-the-code-parent-keeps-business-decisions.md) §1 (a rule lives in the repository whose code it governs). Number kept, so `plugins ADR-NNNN` citations stay valid; history before the move is in [the parent](https://github.com/veecode-platform/devportal-plugins-parent/blob/47ab25b/docs/adr).

## Context

`devportal-plugins/.github/workflows/publish.yml` publishes each workspace to npm on a
manual dispatch with a typed version (`make publish`, `make publish-dynamic`). The channel
is dead in practice (registry and Docker Hub read on 2026-09-17):

| Package | npm (last publish) | Delivered via OCI |
|---|---|---|
| `backstage-plugin-kong-service-manager` | 1.1.0, 2026-03-20 | 1.5.2 in production |
| `backstage-plugin-about` | 1.1.0, 2026-03-20 | via the catalog index |
| `backstage-plugin-gitlab-pipelines` | 0.7.0, 2025-06-27 | via the catalog index |
| `plugin-aws-cost-insights` | never published | shipped through OCI only |

The OCI export checks out the git source at the SHA in the overlay's `source.json` and
builds from it; npm is not involved. Every 3.x consumer installs by `oci://`; none references `@veecode-platform/*` on npm.
Remaining npm consumers: two lines in
`devportal-core/veecode/dynamic-plugins.veecode.yaml` (`about*-dynamic@1.1.0`) and the
frozen 2.x line (`devportal-base`, `devportal-platform`: `ldap-auth`, `ldap-auth-backend`,
`plugin-application-common`, `plugin-scaffolder-backend-module-kong`).

Upstream publishes npm because `rhdh-plugins` is a library for the whole Backstage
ecosystem. Our plugins are product; product is delivered as OCI. This is a **deliberate
deviation from the upstream pattern**, recorded as such.

## Decision

1. Publishing a plugin means: bump the version in the monorepo, point the overlay
   workspace's `source.json` at that commit, publish the OCI artifact, publish the catalog
   index. There is no other channel. `publish.yml` is removed; `make set-version` stays as
   the version bump.
2. Three conditions before the flow is removed: (a) the two npm references in
   `devportal-core/veecode/dynamic-plugins.veecode.yaml` move to `oci://`; (b) the npm
   `*-dynamic` wrappers are removed (`make publish-dynamic`, the marketplace `*-dynamic`
   packages) — they exist only to install dynamic plugins from npm; (c) the 2.x line is
   declared frozen at the last published npm version of the four packages it consumes.
3. "Publishing is automatic and versioned; promotion is manual and human" — already the
   overlays fork's standing rule — becomes a program principle: a versioned publication
   never needs a human; anything that moves a pointer consumed by a live instance does.
4. Proof 2 (ADR-0009) does not depend on npm or on OCI: it loads `dist-dynamic` from
   disk. The worst case — needing the overlay to publish an OCI image just to test — does
   not occur.

## Consequences

- **Positive**: one delivery channel, one version to reason about, no stale registry
  masquerading as a release; `validate-metadata` keeps comparing overlay metadata with
  `package.json`.
- **Negative / trade-offs**: 2.x receives no further versions of the four packages;
  anyone doing a static (`yarn add`) install of a VeeCode plugin loses that path — none was
  found.
- **Follow-ups**: the three conditions above; the `devportal-publish` skill (ADR-0008 §6)
  becomes the only onboarding path into the overlay, absorbing the local
  `plugin-releaser` agent; a note in the 2.x docs.

## Alternatives considered

- **Keep both channels** — the npm side is already four minor versions stale and nobody
  noticed; two channels is one more thing to drift.
- **Make npm current again** — work spent on a channel with no consumer.
