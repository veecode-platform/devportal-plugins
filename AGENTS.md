# Agent Guidelines

This repository is a collection of independent Backstage plugin workspaces.

Use the [`devportal-workspace` skill](.agents/skills/devportal-workspace/SKILL.md) before changing files.

Read [CONTRIBUTING.md](CONTRIBUTING.md) for cross-workspace rules and gates.

Use [CONTEXT.md](CONTEXT.md) for vocabulary.

Work in the official order: build and prove in the workspace (proof 1), prove in
`devportal-local` (proof 2), then publish through `export-overlays`. Publishing before
proof 2 is an exception you state in the overlay PR, never the default; see
[CONTRIBUTING.md](CONTRIBUTING.md#the-four-proofs-and-the-official-test-flow).
