# Dummy Plugin

This workspace contains dummy plugin pair (frontend + backend) for demonstration purposes. The intent is to test frontend and backend plugin loading, error handling, and other related functionalities in a controlled environment.

To start the app, run:

```sh
yarn install
yarn start
```

## Dummy Backend Plugin

A simple backend plugin demonstrating core Backstage backend functionality including HTTP API endpoints, service architecture, and dependency injection patterns.

Implements a `/teams` endpoint returning mock soccer data for testing plugin loading and integration.

Backend plugin documentation is available at [plugins/dummy-backend/README.md](plugins/dummy-backend/README.md).

## Dummy Frontend Plugin

A comprehensive frontend plugin demonstrating UI integration patterns, API communication, and component composition. Provides a full-page interface, entity integration as card/tab, and displays data fetched from the backend plugin in structured tables.

Frontend plugin documentation is available at [plugins/dummy/README.md](plugins/dummy/README.md).

## Static and Dynamic Loading

Both plugins are available as static "normal" plugins and as a dynamic plugins. See [Backstage Plugins](https://docs.platform.vee.codes/devportal/plugins/) page for more details on plugin types and loading.

See the [Makefile](Makefile) for more details on the build/package process.
