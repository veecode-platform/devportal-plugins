---
name: devportal-workspace
description: >-
  Route work in the devportal-plugins monorepo to the affected workspace and its
  local agent instructions, including documentation-only changes.
---

# DevPortal workspace

Use this skill before changing anything under `workspaces/`.

1. Identify every affected `workspaces/<name>` from the paths being touched.
2. Before any change, read that workspace's `AGENTS.md`; it is mandatory and
   contains the workspace's commands, layout, architecture, proof mapping, and
   change conventions.
3. Run Yarn, Make, package, and test commands from the affected workspace root.
   Do not use the monorepo root as a substitute for a workspace root.
4. Use [CONTEXT.md](../../../CONTEXT.md) for the program vocabulary. Do not
   redefine its terms in workspace instructions.

## Before finishing

Read [CONTRIBUTING.md](../../../CONTRIBUTING.md), including its role-to-proof
matrix and pull-request rules. Pass the applicable gates named there:

- `tsc:full`
- `prettier:check`
- `lint:all`
- `test:all`
- the role-appropriate proof and the host-version check

The repository workflow currently reports these gates rather than blocking on
them; the workspace instructions still identify the evidence required for the
change.
