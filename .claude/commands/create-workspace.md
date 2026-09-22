Create a new plugin workspace in `workspaces/`.

Argument: $ARGUMENTS (`<name> <role>`, role is `frontend-plugin` or `backend-plugin`). If
either is missing, ask for it.

Run from the repository root:

```bash
yarn create-workspace <name> --role <role>
```

The scaffold renders the workspace shell, creates the plugin with `backstage-cli new`, pins
it to the DevPortal host's Backstage line and formats the tree (see `CONTRIBUTING.md`,
Reference implementation). It needs network and takes a few minutes. Do not scaffold with
`@backstage/create-app` or copy another workspace by hand.

Then follow the generated `workspaces/<name>/AGENTS.md` for the proofs.
