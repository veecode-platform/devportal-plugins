# VeeCode DevPortal Plugins — AI Agent Guidelines

This document provides high-level guidance for AI agents working with this repository.

## Ecosystem Overview

VeeCode DevPortal is a production-ready, open-source Backstage distribution designed for Internal Developer Portal (IDP) solutions. It enables organizations to adopt platform engineering practices without the operational overhead of building and maintaining a custom Backstage deployment.

This repository contains multiple independent Yarn workspaces, each housing one or more Backstage plugins and modules. Each workspace can be built, tested, and published independently via Makefile commands. Plugins are published to the `@veecode-platform` NPM namespace in both static and dynamic formats.

## Repository Overview

This is a monorepo for VeeCode DevPortal plugins (Backstage plugins). Each workspace is itself a Backstage hosting app with yarn workspaces:

- The Backstage hosting app root (see `package.json` and `app-config*.yaml`)
- The Backstage frontend at `packages/app`
- The Backstage backend at `packages/backend`
- The plugins being developed at `plugins/*`

The hosting app exists for development and testing. The actual releases are the plugins themselves, not the hosting app.

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

To start the Backstage hosting app:

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

Version variable names may vary by workspace, but we may change to use the same variable name `PLUGIN_VERSION` for all workspaces (setting a value for each run):

- homepage: `HOMEPAGE_VERSION`
- global-header: `GLOBAL_HEADER_VERSION`
- github-workflows: `GH_WORKFLOWS_VERSION`
- ldap-auth: `LDAP_AUTH_VERSION`
- kong-tools: `KONG_TOOLS_VERSION`
- kubernetes: `KUBERNETES_VERSION`

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
├── ldap-auth/             # ldap-auth frontend + backend
├── kong-tools/            # scaffolder-backend-module-kong plugin
├── kubernetes/            # kubernetes plugin (WIP)
├── about/                 # about plugin (WIP - no hosting app yet)
└── support/               # support plugin (WIP - no hosting app yet)
```

Each complete workspace contains:

- `packages/app` - Backstage frontend app (for testing)
- `packages/backend` - Backstage backend app (for testing)
- `plugins/` - The actual plugin packages to publish

### Plugin Variants

Plugins are published in two forms:

- **Static**: Regular npm packages for standard Backstage integration
- **Dynamic**: Built with `@red-hat-developer-hub/cli plugin export` for RHDH dynamic loading

Dynamic plugin builds create a `dist-dynamic/` directory within each plugin.

### Package Namespacing

All plugins are published to the `@veecode-platform/*` npm namespace.

### Yarn Workspace Dependencies

Plugins within the same workspace may use `workspace:*` for internal dependencies. Before publishing, these must be replaced with actual version numbers (handled by Makefile targets like `replace-workspace`).

### Yarn Workspace Upgrading

Plugins should have an `update-backstage` section for upgrading the Backstage hosting app:

```json
"scripts": {
  "update-backstage": "backstage-cli versions:bump"
}
```

## Key Files

- `./Makefile` - Root-level cross-workspace utilities
- `./workspace/<name>/Makefile` - Workspace-specific build/publish tasks
- `./workspace/<name>/app-config.yaml` - Backstage config for local development
