# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is a single repository for several Backstage plugin projects (VeeCode DevPortal plugins). Each workspace is itself a Backstage hosting app composed by yarn workspaces:

- The Backstage hosting app is at root (see `package.json` and `app-config*.yaml` files)
- The Backstage hosting app frontend at `packages/app`
- The Backstage hosting app frontend at `packages/app`
- The Plugins being developed are under `plugins/*`.

The reason for this structure is to allow for easy development and testing of the plugins independently. It is important to understand that the "release" for each workspace are the plugind themselves, not the hosting app.

## Common Commands

### Per-Workspace Development

Each workspace is self-contained. Navigate to the workspace first:

```bash
cd workspace/<workspace-name>
yarn install
yarn tsc             # TypeScript check
yarn build:all       # Build all packages
yarn test:all        # Run tests
yarn lint:all        # Lint all files
```

This should build all packages in the workspace, including the Backstage hosting app and all workspace plugins.

To start the Backstage hosting app, run:

```bash
yarn start
```

### Workspace Makefiles

Each workspace has its own Makefile with build, publish, and utility commands:

```bash
cd workspace/<workspace-name>
make help            # Shows all available commands
make build           # Build the plugin(s)
make build-dynamic   # Build dynamic plugin(s)
make publish         # Publish static plugin(s)
make publish-dynamic # Publish dynamic plugin(s)
make set-version VERSION=x.x.x  # Set version
make cleanup         # Clean build artifacts
make get-version     # Get published version from npm
```

For homepage workspace:

```bash
cd workspace/homepage
make help
make set-version HOMEPAGE_VERSION=1.0.2
```

For global-header workspace:

```bash
cd workspace/global-header
make help
make set-version GLOBAL_HEADER_VERSION=1.0.3
```

For github-workflows workspace:

```bash
cd workspace/github-workflows
make help
make build-all                    # Build common, frontend, backend
make set-version GH_WORKFLOWS_VERSION=1.4.0
make publish-all
make publish-all-dynamic
```

For ldap-auth workspace:

```bash
cd workspace/ldap-auth
make help
make build-all
make set-version LDAP_AUTH_VERSION=1.0.0
make publish-all
```

For kong-tools workspace:

```bash
cd workspace/kong-tools
make help
make set-version KONG_TOOLS_VERSION=0.2.0
```

### Root-Level Makefile

The root Makefile provides cross-workspace utilities:

```bash
make help                  # List available commands
make echo-paths            # Show dynamic plugin paths
make copy-dynamic-plugins  # Copy all dynamic plugins to DYNAMIC_PLUGIN_ROOT
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

- `/Makefile` - Root-level cross-workspace utilities
- `/workspace/<name>/Makefile` - Workspace-specific build/publish tasks
- `/workspace/<name>/app-config.yaml` - Backstage config for local development
