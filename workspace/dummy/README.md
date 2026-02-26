# Dummy Plugin

This workspace contains dummy plugin pair (frontend + backend) for demonstration purposes. The intent is to serve as a reference plugin workspace, so plugin authors will know what makes a complete workspace and what are the best practices for plugin development.

To start the app, run:

```sh
yarn install
yarn start
```

## Dummy Backend Plugin

A simple backend plugin demonstrating core Backstage backend functionality including HTTP API endpoints, service architecture, and dependency injection patterns.

Implements a `/teams` endpoint returning mock paginated soccer data for testing plugin loading and integration.

Backend plugin documentation is available at [plugins/dummy-backend/README.md](plugins/dummy-backend/README.md).

## Dummy Frontend Plugin

A comprehensive frontend plugin demonstrating UI integration patterns, API communication, and component composition. Provides a full-page interface, entity integration as card/tab, and displays data fetched from the backend plugin in structured tables.

Frontend plugin documentation is available at [plugins/dummy/README.md](plugins/dummy/README.md).

## Static and Dynamic Loading

Both plugins are available as static "normal" plugins and as a dynamic plugins. See [Backstage Plugins](https://docs.platform.vee.codes/devportal/plugins/) page for more details on plugin types and loading.

## Building and Publishing

See the [Makefile](Makefile) for more details on the build/package process.

- There are targets for building, packing, and publishing both static and dynamic versions of the plugins.
- There are targets for getting the latest version in npm registry and unpublishing all packages (they work well with local registries).
- There are targets for cleaning up builds - just the `dist-dynamic` directories (to force fresh export with latest dependencies), or all build artifacts (like `dist` and `dist-dynamic` and even `node_modules`).

## Testing

- Plugins tests can be run using the `yarn test` command in each plugin directory (should mock everything).
- Plugins can run in standalone mode using the `yarn start` command in each plugin directory (should mock everything).
- Running the hosting app will test plugins integration (no mocking).
- Running `docker compose up` will run a devportal container mounting the files and folders below so dynamic loading behavior is tested:
  - The plugins' `dist-dynamic` folders (under `/app/dynamic-plugins/dist/`)
  - The `app-config.dynamic.yaml` file (as `/app/app-config.local.yaml`)
  - The `dynamic-plugins.yaml` file (as `/app/dynamic-plugins.yaml`)
