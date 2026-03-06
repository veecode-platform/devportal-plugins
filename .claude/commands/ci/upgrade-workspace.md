# Workspace Backstage Upgrade (Automated)

Upgrade Backstage dependencies for a single workspace with full build
validation. This is the CI version — runs unattended in GitHub Actions.
The orchestrator workflow passes the workspace name via the `$WORKSPACE`
environment variable.

## High-level flow

1. Install dependencies
2. Capture current Backstage version
3. Run `versions:bump`
4. Check for changes — if none, save up-to-date result and stop
5. Validate (install → tsc → build → export-dynamic → test)
6. Save results (JSON + patch)

## Deterministic scripts modify files on disk

Steps 3 (`versions:bump`) and 8 (`make build-dynamic`) run deterministic
scripts that modify files in the working tree. Treat ALL changes in the
`workspace/$WORKSPACE/` directory as part of the upgrade — preserve every
modified file through the remaining steps and include them all in the
final `git diff` patch.

## Output management

Redirect verbose command output (yarn install, yarn tsc, yarn build:all,
yarn test, make build-dynamic) to temporary log files. Check the exit
code to determine success or failure. Inspect log file contents only when
a command exits with non-zero status.

    mkdir -p /tmp/logs
    yarn install > /tmp/logs/install.log 2>&1

## Steps

1. **Navigate to workspace and install dependencies**:

   ```bash
   cd workspace/$WORKSPACE && yarn install > /tmp/logs/install.log 2>&1
   ```

   Confirm `workspace/$WORKSPACE/` exists and exit code is 0.

2. **Capture current Backstage version**:

   Record the current `@backstage/core-plugin-api` version (or another
   `@backstage/*` package) from `package.json` or `yarn.lock` so the
   report can show the before/after delta.

3. **Run the upgrade**:

   ```bash
   yarn backstage-cli versions:bump --pattern '@{backstage,roadiehq,backstage-community}/*'
   ```

4. **Check for actual changes**:

   ```bash
   git status --porcelain 'workspace/$WORKSPACE/'
   ```

   If no files were modified: save the up-to-date result and stop.

   ```bash
   mkdir -p /tmp/results
   echo '{"workspace":"'"$WORKSPACE"'","status":"up-to-date"}' > /tmp/results/$WORKSPACE.json
   ```

   Remaining steps in this file are complete.

5. **Install post-bump**:

   ```bash
   yarn install > /tmp/logs/post-install.log 2>&1
   ```

6. **Type check with dedupe handling**:

   ```bash
   yarn tsc > /tmp/logs/tsc.log 2>&1
   ```

   If tsc warns about "duplicate installation" of packages:
   - Run `yarn dedupe > /tmp/logs/dedupe.log 2>&1`
   - Run `yarn install > /tmp/logs/post-dedupe-install.log 2>&1`
   - Run `yarn tsc > /tmp/logs/tsc-retry.log 2>&1`

7. **Build**:

   ```bash
   yarn build:all > /tmp/logs/build.log 2>&1
   ```

   Success criteria: both `yarn tsc` and `yarn build:all` exit with code 0.

8. **Export dynamic** (if supported):

   ```bash
   grep -q 'build-dynamic' Makefile && make build-dynamic > /tmp/logs/build-dynamic.log 2>&1
   ```

   - If the Makefile has a `build-dynamic` target: run it and record
     `"export_dynamic": "pass"` or `"export_dynamic": "fail"`.
   - If the Makefile has no `build-dynamic` target: record
     `"export_dynamic": "n/a"`.

9. **Test**:

   ```bash
   yarn test --watchAll=false > /tmp/logs/test.log 2>&1
   ```

10. **Save results**:

    ```bash
    mkdir -p /tmp/results
    git diff . > /tmp/results/$WORKSPACE.patch
    ```

    Save a JSON summary to `/tmp/results/$WORKSPACE.json`:

    ```json
    {
      "workspace": "$WORKSPACE",
      "status": "success",
      "backstage_from": "<previous version>",
      "backstage_to": "<new version>",
      "packages_bumped": 12,
      "tsc": "pass",
      "build": "pass",
      "export_dynamic": "pass | fail | n/a",
      "test": "pass | fail",
      "error": null
    }
    ```

    **Gate rules**: tsc and build (steps 6-7) are blocking gates.
    If either fails after exhausting the error policy retries, revert
    the workspace and report — do NOT generate a patch or continue
    to later steps.

    export-dynamic and test (steps 8-9) are non-blocking. Record
    the result ("pass" or "fail") and continue to step 10 regardless.

## Error policy

**Budget: max 3 fix-retry cycles per step.**

Diagnose using ONLY the error log output and workspace source files.
Limit each diagnosis to reading the first 30 error lines from the log,
then matching against the table below.

When a step fails:

1. Read the first 30 lines of errors:
   `grep "error TS\|Error:" /tmp/logs/<step>.log | head -30`
2. Match the error against the table below.
3. Apply the fix, re-run the command once.
4. If the retry fails with a **new** error, apply one more fix.
5. If the third retry also fails → revert and report.

   | Recognition pattern | Error type | Action |
   |---|---|---|
   | `YN0028` / `lockfile would have been modified` | Immutable installs in CI | Prefix with `YARN_ENABLE_IMMUTABLE_INSTALLS=false` → retry |
   | `duplicate installation of` | Duplicate packages | `yarn dedupe` → `yarn install` → retry |
   | `Cannot find module '...'` / `Module '"..."' has no exported member` | Import moved/renamed | Adjust the import path → retry |
   | `Cannot find type definition file for '...'` | Missing type definitions (transitive dep became peer dep after bump) | `yarn add -D <package>` where `<package>` is the name inside the quotes → `yarn install` → retry |
   | `error TS2339` on properties in a `declare module` block inside a `.d.ts` file, or `error TS2698` about extending a type alias | Module augmentation conflict (TS 5.8 broke `declare module` for type aliases) | Convert from `declare module '@backstage/config' { interface Config { ... } }` to `export interface Config { ... }` (direct export). Preserve all JSDoc annotations including `@visibility`. → retry |
   | Deprecated API with replacement noted in the error message | Deprecated API migration | Apply the documented replacement → retry |
   | Errors spanning 3+ source files | Broad breaking change | Revert and report |
   | Any other unrecognized pattern | Unknown | Revert and report |

**Revert and report**: revert all workspace changes with
`git checkout -- workspace/$WORKSPACE/`, then save:

```json
{
  "workspace": "$WORKSPACE",
  "status": "failed",
  "error": "<one-line classification>: <specific error message>"
}
```

Write this to `/tmp/results/$WORKSPACE.json` and stop.
