Create a new Backstage workspace in the `workspace/` directory.

Argument: $ARGUMENTS (workspace name). If empty, ask the user for a name.

Validation — before doing anything else:

- Must be exactly one argument (no spaces). If more than one word is provided, stop and tell the user.
- Must match `^[a-z0-9]([a-z0-9-]*[a-z0-9])?$` (lowercase alphanumeric and hyphens only, cannot start or end with a hyphen). If invalid, stop and tell the user.
- The directory `workspace/$ARGUMENTS` must not already exist. If it does, stop and tell the user.

Steps:

1. Run `npx @backstage/create-app@latest --path workspace/$ARGUMENTS --skip-install` to scaffold the workspace.

2. In the new workspace's `package.json` (`workspace/$ARGUMENTS/package.json`), add this script if not already present:

   ```
   "update-backstage": "backstage-cli versions:bump"
   ```

3. Update the workspace to use MUI v5 — remove any `@material-ui/*` dependencies (MUI v4) from all `package.json` files under `workspace/$ARGUMENTS/` and replace them with their `@mui/*` equivalents. Also update any source code imports from `@material-ui/core` to `@mui/material`, `@material-ui/icons` to `@mui/icons-material`, and `@material-ui/lab` to `@mui/lab`. Apply the same to any `makeStyles`/`createStyles` usage (move to `@mui/styles` or `tss-react` if needed).

4. Run `cd workspace/$ARGUMENTS && yarn update-backstage` to bump Backstage dependencies to latest.
