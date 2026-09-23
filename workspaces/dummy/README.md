# Dummy Plugin

This workspace contains dummy plugin pair (frontend + backend) for demonstration purposes. The intent is to serve as a reference plugin workspace, so plugin authors will know what makes a complete workspace and what are the best practices for plugin development.

## Workspace Structure

```pre
workspaces/dummy/
├── packages/
│   ├── app/              # Frontend hosting app (for development/testing)
│   └── backend/          # Backend hosting app (for development/testing)
├── plugins/
│   ├── dummy/            # Frontend plugin (@veecode-platform/backstage-plugin-dummy)
│   └── dummy-backend/    # Backend plugin (@veecode-platform/backstage-plugin-dummy-backend)
├── dynamic-plugins.yaml  # Dynamic plugin configuration
├── app-config.yaml       # Backstage config for local development
└── Makefile              # Build, packaging, and utility targets
```

## Quick Start

To start the app, run:

```sh
yarn install
yarn start
```

## Dummy Backend Plugin

A simple backend plugin demonstrating core Backstage backend functionality including HTTP API endpoints, service architecture, and dependency injection patterns.

Implements a `/teams` endpoint returning mock paginated soccer data for testing plugin loading and integration.

## Dummy Frontend Plugin

A comprehensive frontend plugin demonstrating UI integration patterns, API communication, and component composition. Provides a full-page interface, entity integration as card/tab, and displays data fetched from the backend plugin in structured tables.

## Static and Dynamic Loading

Both plugins are available as static "normal" plugins and as a dynamic plugins. See [Backstage Plugins](https://docs.platform.vee.codes/devportal/plugins/) page for more details on plugin types and loading.

## Building and Publishing

See the [Makefile](Makefile) for more details on the build/package process.

- The Makefile provides `build`, `build-dynamic`, `pack`, `pack-dynamic`, and `set-version` targets.
- `make clean-dynamic` removes the `dist-dynamic` directories; `make clean` removes build artifacts and local dependencies.

## Testing

### Test Commands

```sh
# Run all tests across all packages (plugins + hosting app)
yarn test:all

# Run all tests with coverage report
yarn test:all --coverage

# Run tests for a specific plugin
cd plugins/dummy && yarn test --watchAll=false
cd plugins/dummy-backend && yarn test --watchAll=false

# Run hosting app wiring tests
cd packages/app && yarn test --watchAll=false
cd packages/backend && yarn test --watchAll=false
```

### Test Strategy

Tests are organized in three layers:

1. **Plugin unit tests** (`plugins/*/src/`): Test plugin components and services in isolation using mocks. Frontend uses `@backstage/test-utils` (`renderInTestApp`, `TestApiProvider`). Backend uses `@backstage/backend-test-utils` (`startTestBackend`).

2. **Hosting app wiring tests** (`packages/app/src/`, `packages/backend/src/`): Verify plugins are correctly registered, exported, and accessible through the hosting app.

3. **Integration testing**: Run the hosting app (`yarn start`) to test plugins working together without mocks. Run `yarn dev:dynamic` and then the printed `devportal-local` command to test dynamic plugin loading (see below).

### Dynamic Plugin Testing

Run `yarn dev:dynamic` from this workspace. It exports both plugins into the
`devportal-local` checkout, generates the local operator config, and prints the exact
runner command to start the proof-2 portal.
