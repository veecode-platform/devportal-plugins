# Workspace Backstage Upgrade (Interactive)

Upgrade Backstage dependencies for a single workspace with full build
validation. Interactive version — prompts for user decisions at key
checkpoints.

## Steps

1. **Select workspace**:

   List all available workspaces:

   ```bash
   ls -d workspace/*/package.json
   ```

   Display them in a numbered list (extracting the workspace name from
   each path) and use `AskUserQuestion` to let the user pick which
   workspace to upgrade. Set `$WORKSPACE` from the selection.

2. **Navigate to workspace and install dependencies**:

   ```bash
   cd workspace/$WORKSPACE && yarn install
   ```

   Confirm `workspace/$WORKSPACE/` exists and `yarn install` exits with code 0.

3. **Capture current Backstage version**:

   Record the current `@backstage/core-plugin-api` version (or another
   `@backstage/*` package) from `package.json` or `yarn.lock` so the
   report can show the before/after delta.

4. **Run the upgrade**:

   ```bash
   yarn backstage-cli versions:bump --pattern '@{backstage,roadiehq,backstage-community}/*'
   ```

5. **Check for actual changes**:

   ```bash
   git status --porcelain 'workspace/$WORKSPACE/'
   ```

   If no files were modified, inform the user: "All Backstage packages
   in `$WORKSPACE` are already at the latest version." and stop.

6. **Review changes with user**:

   Parse the output of `versions:bump` and show a summary table:

   | Package | Old Version | New Version |
   |---------|-------------|-------------|
   | @backstage/core-plugin-api | 1.9.0 | 1.10.0 |

   Use `AskUserQuestion` to let the user review and confirm. If the
   user rejects, revert with `git checkout -- workspace/$WORKSPACE/`
   and stop.

7. **Install post-bump**:

   ```bash
   yarn install
   ```

8. **Type check with dedupe handling**:

   ```bash
   yarn tsc
   ```

   If tsc warns about "duplicate installation" of packages:
   - Alert the user about the warnings
   - Run `yarn dedupe`
   - Run `yarn install` and `yarn tsc` again

9. **Build**:

   ```bash
   yarn build:all
   ```

   Success criteria: both `yarn tsc` and `yarn build:all` exit with code 0.

10. **Export dynamic** (if supported):

    Check whether the Makefile has a `build-dynamic` target:

    ```bash
    grep -q 'build-dynamic' Makefile
    ```

    If the target exists, use `AskUserQuestion` to ask the user whether
    to run the dynamic export. If confirmed:

    ```bash
    make build-dynamic
    ```

    If no `build-dynamic` target, inform the user that dynamic export
    is not applicable for this workspace.

11. **Test**:

    ```bash
    yarn test --watchAll=false
    ```

12. **Report results**:

    Print a summary:

    | Check | Result |
    |-------|--------|
    | Workspace | $WORKSPACE |
    | Backstage | <old> → <new> |
    | Packages bumped | N |
    | tsc | pass / fail |
    | build:all | pass / fail |
    | build-dynamic | pass / fail / n/a / skipped |
    | test | pass / fail |
    | Duplicate warnings | yes / no |

## Error handling

This is the interactive version — report errors to the user and let them
decide. Present the full error output and use `AskUserQuestion` to offer
options (e.g., "Retry", "Revert changes and exit", "Continue anyway").
