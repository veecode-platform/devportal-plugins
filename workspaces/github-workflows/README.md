# Github Workflows Workspace

This repo contains:

- Github Workspace backend plugin: `plugins/github-workflow-backend`
- Github Workspace frontend plugin: `plugins/github-workflows`
- Github Workspace common library: `plugins/github-workflows-common`
- Github Workspace hosting app: `packages/app` and `packages/backend`

## Development

To start the hosting app while developing the plugin:

```sh
yarn install
yarn start
```

## Publish Plugins

```sh
make publish-common
```

## Publish Dynamic  Plugin
