# Claude Code Prompts

Orchestrator prompts for automated maintenance of devportal-plugins.

## Prompts

| File | Purpose |
|------|---------|
| `automated-update.md` | Dry-run (local) -- applies updates to working tree only, no git operations |
| `automated-update-ci.md` | CI version -- runs per-workspace upgrades in GitHub Actions matrix |

## Running a dry-run locally

```bash
cd /path/to/devportal-plugins
.github/prompts/claude-watch.sh .github/prompts/automated-update.md
```

To restrict which tools the agent can use:

```bash
.github/prompts/claude-watch.sh .github/prompts/automated-update.md "Bash,Read,Glob,Grep"
```

### Requirements

- `claude` CLI installed and authenticated
- `jq` installed
- Run from the repo root

### After the run

Review changes with `git diff` and revert if needed with `git checkout .`.
