# VeeCode DevPortal Plugins

This repository hosts Backstage plugins developed by VeeCode for [VeeCode DevPortal](https://docs.platform.vee.codes/devportal/), an open-source Backstage distribution for Internal Developer Portals (IDP).

Plugins are published to the `@veecode-platform` npm namespace in both static and dynamic formats. They are compatible with any Backstage build and with Red Hat Developer Hub (RHDH).

## Workspaces

Each workspace groups related plugins together. A workspace is an independent Backstage app used to develop and test its plugins.

| Workspace | Plugins | Description | Status |
|-----------|---------|-------------|--------|
| [homepage](workspace/homepage/) | veecode-homepage | Homepage plugin | Ready |
| [global-header](workspace/global-header/) | veecode-global-header | Global header plugin | Ready |
| [github-workflows](workspace/github-workflows/) | github-workflows, github-workflows-common, github-workflow-backend | GitHub workflows (frontend + backend + common) | Ready |
| [ldap-auth](workspace/ldap-auth/) | ldap-auth, ldap-auth-backend | LDAP auth (port from @immobiliarelabs) | Ready |
| [kong-tools](workspace/kong-tools/) | scaffolder-backend-module-kong, kong-service-manager, kong-service-manager-backend, kong-service-manager-common, scaffolder-field-extensions-kong | Kong scaffolder actions and service manager | Ready |
| [kubernetes](workspace/kubernetes/) | kubernetes-backend-module-getsecret | Kubernetes secret access module | WIP |
| [about](workspace/about/) | about, about-backend | About plugin | ready. |
| [dummy](workspace/dummy/) | dummy, dummy-backend | **Reference implementation** for plugin authors | Ready |

## Getting Started

Each workspace is self-contained. Navigate to a workspace and run:

```sh
cd workspace/<name>
yarn install
yarn start          # Start the Backstage hosting app
```

To build and test:

```sh
yarn tsc            # TypeScript check
yarn build:all      # Build all packages
yarn test:all       # Run all tests
yarn lint:all       # Lint all files
```

## Building and Publishing

Every workspace has a Makefile with standardized targets:

```sh
cd workspace/<name>
make help               # Show all available commands
make build              # Build all static plugins
make build-dynamic      # Build all dynamic plugins (uses @red-hat-developer-hub/cli)
make publish            # Publish static plugins to npm
make publish-dynamic    # Publish dynamic plugins to npm
make set-version VERSION=x.y.z  # Set version for all plugins in workspace
make get-version        # Show latest published versions
make clean              # Full clean
```

To copy dynamic plugins to a local DevPortal instance for testing:

```sh
make copy-dynamic-plugins
```

## Using a Private Registry

You can validate publishing locally with [Verdaccio](https://verdaccio.org/):

```sh
verdaccio -l 0.0.0.0:4873
```

Some Makefile tasks accept a `NPM_REGISTRY` parameter to specify a custom registry. For example:

```sh
make publish NPM_REGISTRY=http://localhost:4873
```

This is important for testing dynamic plugins publishing (the `export-dynamic` task may break internal dependencies sometimes).

## Reference Implementation

The **dummy** workspace (`workspace/dummy/`) is the canonical reference for plugin authors. It demonstrates:

- Frontend plugin with full-page view, entity cards, and entity tabs
- Backend plugin with HTTP API, service architecture, and dependency injection
- Complete test suite (plugin unit tests, hosting app wiring tests)
- Dynamic plugin support with Docker Compose testing
- Standardized Makefile with all build/publish targets

When creating a new workspace, use dummy as the template to follow.

## Background

This monorepo replaces the previous multi-repository setup at [veecode-platform/backstage-plugins](https://github.com/veecode-platform/backstage-plugins) and [veecode-platform/dynamic-plugins](https://github.com/veecode-platform/dynamic-plugins). The structure is based on [backstage/community-plugins](https://github.com/backstage/community-plugins) and [redhat-developer/rhdh-plugins](https://github.com/redhat-developer/rhdh-plugins).
