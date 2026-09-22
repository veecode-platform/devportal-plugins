---
name: devportal-publish
description: >-
  Generate or update a plugin's entry in devportal-plugin-export-overlays and
  verify the version coherence that publish depends on, before any PR opens.
---

# DevPortal publish

Use this skill from inside a `devportal-plugins` workspace (e.g.
`workspaces/about`) once a plugin's `product` (the packages under `plugins/`,
per [CONTEXT.md](../../../CONTEXT.md)) is ready to publish: proof 1 done, and
proof 2 run against `devportal-local` via the
[`devportal-context` skill](../devportal-context/SKILL.md) if you need to
re-check the export. This skill covers the third leg of the official flow —
"publish through `export-overlays`" — up to opening the overlay PR.

It does not build, export, or push anything itself. It edits metadata in
`devportal-plugin-export-overlays` and checks that the numbers in that
metadata agree with each other and with the source they claim to describe.

## Why this exists

The registry tag `spec.dynamicArtifact` writes to is immutable. If a content
change ships under a version that already has a tag, the push is skipped, CI
stays green, and the catalog index keeps pointing at the old digest — nobody
gets an error. The local agent
[`plugin-releaser`](file:///home/gio/.claude/agents/plugin-releaser.md) drives
the release cycle end to end and names the exact failure mode; this skill
automates the part of its job that is mechanical (generating/updating the
overlay files) and, more importantly, the part that is easy to get wrong by
hand: confirming every place a version appears actually agrees before a PR is
even opened.

## What it reads

From the `devportal-plugins` workspace (read-only, never edited):

- `workspaces/<ws>/plugins/<plugin>/package.json` — `.name`, `.version`,
  `.backstage.role`. There is one of these per publishable plugin package; if
  a workspace has more than one (e.g. `about` has both `about` and
  `about-backend` — `workspaces/about/plugins/{about,about-backend}/package.json`),
  pass `--plugin <dir>` to pick one. The script refuses to guess when there
  is more than one candidate — same policy as
  [`devportal-context`](../devportal-context/SKILL.md)'s resolver.
- `workspaces/<ws>/backstage.json` — the workspace's own Backstage pin, used
  only for `spec.backstage.supportedVersions` in the generated metadata.
- `workspaces/<ws>/dynamic-plugins.yaml` — cross-checked, report-only, to
  flag if the plugin folder doesn't look wired into the workspace's dev
  shell.
- `git rev-parse HEAD` (or `--ref`) in the `devportal-plugins` checkout, for
  `source.json`'s `repo-ref`. The script warns (does not block) when that SHA
  isn't reachable from any remote-tracking branch, since the overlays repo's
  CI fetches this ref from the public remote and cannot see purely-local
  commits.

From `devportal-plugin-export-overlays` (`--overlays-repo`, default
`~/workspace/content-export/devportal-plugin-export-overlays`):

- `versions.json` `.backstage` — the registry-wide Backstage line every
  `bs_<version>` tag segment must use. **Not** the same value as the
  workspace's own `backstage.json`; see the coherence section below.
- `workspaces/<ws>/{source.json,plugins-list.yaml,metadata/*.yaml}` and
  `catalog-entities/extensions/plugins/{<name>.yaml,all.yaml}` — read to
  decide whether an entry already exists and, if so, whether it needs a
  version bump.

The overlay workspace directory is assumed to share the `devportal-plugins`
workspace's name (`workspaces/about` in both repos). Evidence:
`workspaces/veecode-homepage` and `workspaces/ai-resources` exist under both
repos with the identical name. The script never invents a different mapping.

## What it writes (only with `--write`)

Under `devportal-plugin-export-overlays/workspaces/<ws>/`:

| File | New entry | Existing entry |
|---|---|---|
| `source.json` | created (`repo`, `repo-ref`, `repo-flat: false`, `repo-backstage-version`) | rewritten only if any field differs |
| `plugins-list.yaml` | `plugins/<plugin-dir>:` appended | appended only if the key is missing |
| `metadata/<flattened-name>.yaml` | created from a `kind: Package` template, with `TODO(devportal-publish)` markers on the prose fields (title, links, support, `appConfigExamples`) that need a human | only `version:` and, for per-plugin-form tags, the `dynamicArtifact:` version segment are rewritten in place — everything else, including hand-written comments, is left untouched |

`<flattened-name>` is `package.json .name` with the leading `@` stripped and
`/` replaced by `-` — the same transform
`devportal-plugin-export-utils/export-dynamic/export-dynamic.sh` applies to
compute `PLUGIN_NAME`, and the value already used as both filename and
`metadata.name` in `veecode-platform-backstage-plugin-catalog-backend-module-ai-resources.yaml`
and `veecode-platform-plugin-veecode-homepage.yaml`.

Optionally, with `--catalog-entry` (default **off**):

- `catalog-entities/extensions/plugins/<plugin-dir>.yaml` — a `kind: Plugin`
  template, also with `TODO` prose markers.
- its line added to `catalog-entities/extensions/plugins/all.yaml`.

Default is off because every VeeCode-owned entry in the overlays repo today
deliberately has no `Plugin` entity —
`workspaces/ai-resources/metadata/veecode-platform-backstage-plugin-catalog-backend-module-ai-resources.yaml`
and `workspaces/veecode-homepage/metadata/veecode-platform-plugin-veecode-homepage.yaml`
both say so explicitly in a comment ("intentionally NO Plugin catalog entity
... must NOT appear in the client marketplace"). Pass `--catalog-entry`
explicitly when this plugin is meant to appear in the Extensions UI.

No file outside `.agents/skills/devportal-publish/` is ever touched by this
skill, and nothing is written at all unless `--write` is passed.

## The coherence check

Runs after every `--write` (and again, mandatorily, before `--open-pr`).
Absorbed from `plugin-releaser`'s "triple that must agree" and its per-plugin
vs. bundle tag-form table:

1. `package.json .version` == metadata `spec.version`
2. metadata `spec.version` == the version segment in `spec.dynamicArtifact`
   (**per-plugin form only** — `oci://.../<name>:bs_<bs>__<version>`; a
   **bundle-form** tag, `oci://.../<workspace>:bs_<bs>!<package-name>`,
   carries no version segment, so this check reports OK-by-definition rather
   than flagging it, per `plugin-releaser`'s explicit warning against that
   false positive — see `workspaces/mcp-integrations/metadata/red-hat-developer-hub-backstage-plugin-kubernetes-mcp-extras.yaml`
   for a live bundle-form example next to three sibling files already
   migrated to per-plugin form)
3. `source.json repo-ref`, read at that exact SHA
   (`git show <ref>:workspaces/<ws>/plugins/<plugin>/package.json`), actually
   contains a `package.json` at this same version — catches a stale ref that
   would make the overlay publish an older commit under today's version
   string
4. a fifth check beyond the brief's four, because the data proved it
   necessary: the tag's `bs_<version>` segment matches `versions.json`
   `.backstage`, **not** the workspace's own `backstage.json` /
   `source.json repo-backstage-version`. Evidence:
   `workspaces/mcp-integrations/source.json` declares
   `repo-backstage-version: 1.54.1`, yet all four of that workspace's tags
   are `bs_1.52.0`, matching `versions.json`'s `1.52.0` — the workspace pin
   and the registry-wide publish line are different numbers, and minting a
   tag from the wrong one is exactly "a stale Backstage segment publishes to
   a line nobody resolves" (`plugin-releaser`, step 2). This is a hard gate
   like the other four, not a bonus.

A `FAIL` on any check exits non-zero and the run stops before `--open-pr` is
even considered. Newly generated files also get a printed reminder about
their `TODO` prose markers — the check verifies numbers, not whether the
title and description have been written.

## Opening the PR

Never happens automatically. `--open-pr` alone is refused; it additionally
requires `--write` and `--yes` in the same invocation, and only runs after
the coherence check passes. When honored, it creates branch
`publish/<flattened-name>-<version>` from `origin/<base-branch>` in the
overlays repo, commits the changed files, pushes, opens the PR with
`gh pr create`, and then posts `/publish` as a PR **comment**.
`pr-actions.yaml` reacts to `issue_comment` only: a slash command in the PR
body fires nothing and fails silently, so the comment is what starts the
`pr_<number>__<version>` candidate build. Run the proof-2 check on the runner
before opening the PR; nothing in the overlay verifies that the plugin ever
loaded outside CI.

```bash
# plan only (read-only, safe to run anytime)
python3 .agents/skills/devportal-publish/scripts/publish-plugin.py \
  --workspace about --plugin about

# apply the overlay file changes, still no PR
python3 .agents/skills/devportal-publish/scripts/publish-plugin.py \
  --workspace about --plugin about --write

# apply and open the PR (two-gate confirmation)
python3 .agents/skills/devportal-publish/scripts/publish-plugin.py \
  --workspace about --plugin about --write --open-pr --yes
```

After opening the PR, hand off to `/publish` and, once the artifact lands,
`/smoketest` per `CONTRIBUTING.md`'s gates — this skill's job ends at the PR.

## Known gaps

- The `kind: Plugin` template's `namespace: veecode` and lack of a
  `# yaml-language-server: $schema=` line have no precedent to check against:
  no VeeCode-authored `Plugin` entity exists in the overlays repo yet (every
  current VeeCode workspace opts out, see above). Treat the template as a
  starting point, not a verified convention, until a real one merges.
- `--migrate-to-per-plugin` will switch a bundle-form entry to per-plugin
  form during a bump, but only when passed explicitly — it never does this
  silently, per `plugin-releaser`'s rule that a form switch is a resolution
  change, not a cosmetic edit (precedent: commit `57b54e73`).
