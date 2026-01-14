# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is a monorepo for VeeCode DevPortal plugins (Backstage plugins). Each workspace is an independent Backstage app with its own plugins, using Yarn workspaces internally.

## Common Commands

### Per-Workspace Development

Each workspace is self-contained. Navigate to the workspace first:

```bash
cd workspace/<workspace-name>
yarn install
yarn start           # Start the Backstage dev server
yarn tsc             # TypeScript check
yarn build:all       # Build all packages
yarn test            # Run tests
yarn lint:all        # Lint all files
```

### Root-Level Makefile Commands

Build plugins:

```bash
make build-homepage
make build-global-header
make build-homepage-dynamic    # Uses @red-hat-developer-hub/cli
make build-global-header-dynamic
```

Publish plugins (uses npm publish):

```bash
make publish-homepage
make publish-global-header
make publish-homepage-dynamic
make publish-global-header-dynamic
```

Cleanup:

```bash
make cleanup-homepage
make cleanup-global-header
make cleanup-all
```

### Workspace-Specific Makefiles

For github-workflows workspace:

```bash
cd workspace/github-workflows
make help                         # Shows all available commands
make build-all                    # Build common, frontend, backend
make set-version GH_WORKFLOWS_VERSION=1.4.0  # Set version for all packages
make publish-all                  # Publish all static packages
make publish-all-dynamic          # Publish all dynamic packages
```

For ldap-auth workspace:

```bash
cd workspace/ldap-auth
make help
make build-all
make set-version LDAP_AUTH_VERSION=1.0.0
make publish-all
```

## Architecture

### Workspace Structure

```pre
workspace/
├── homepage/              # veecode-homepage plugin
├── global-header/         # veecode-global-header plugin
├── github-workflows/      # github-workflows frontend + backend + common
├── ldap-auth/            # ldap-auth frontend + backend
├── kong-tools/           # kong-scaffolder plugin
└── kubernetes/           # kubernetes plugin
```

Each workspace contains:

- `packages/app` - Backstage frontend app (for testing)
- `packages/backend` - Backstage backend app (for testing)
- `plugins/` - The actual plugin packages to publish

### Plugin Variants

Plugins are published in two forms:

- **Static**: Regular npm packages for standard Backstage integration
- **Dynamic**: Built with `@red-hat-developer-hub/cli plugin export` for RHDH dynamic loading

Dynamic plugin builds create a `dist-dynamic/` directory within each plugin.

### Package Namespacing

All plugins are published to `@veecode-platform/*` npm namespace.

### Yarn Workspace Dependencies

Plugins within the same workspace may use `workspace:*` for internal dependencies. Before publishing, these must be replaced with actual version numbers (handled by Makefile targets like `replace-workspace`).

## Key Files

- `/Makefile` - Root-level build/publish tasks (homepage, global-header)
- `/workspace/<name>/Makefile` - Workspace-specific tasks with more options
- `/workspace/<name>/app-config.yaml` - Backstage config for local development
