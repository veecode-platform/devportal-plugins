<!-- This template is mandatory; see [CONTRIBUTING.md](../../CONTRIBUTING.md). -->

## Commands

Run commands from `{{workspace_root}}`. Use only commands present in this workspace's
`package.json` or `Makefile`:

- `{{workspace_command_1}}` — {{workspace_command_1_purpose}}
- `{{workspace_command_2}}` — {{workspace_command_2_purpose}}
- `{{workspace_gate_commands}}`

## Layout

`{{workspace_root}}` contains `{{workspace_layout}}`. Packages with
`backstage.role` `{{workspace_roles}}` are under `plugins/`; `{{dev_shell_parts}}`
are the dev shell. See [CONTEXT.md](../../CONTEXT.md) for vocabulary.

## Architecture

{{non_obvious_architecture_facts}}

## How to test

Use the [four proofs and official flow](../../CONTRIBUTING.md#the-four-proofs-and-the-official-test-flow)
and the [role matrix](../../CONTRIBUTING.md#which-proofs-apply-to-which-backstagerole).
This workspace applies: `{{proofs_and_role_specific_evidence}}`.

## Pull requests and changesets

Follow [Pull requests](../../CONTRIBUTING.md#pull-requests). Record workspace-only
decisions in `{{decisions_file}}`; {{workspace_specific_change_convention}}.
