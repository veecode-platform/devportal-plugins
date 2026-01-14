# Dummy Plugin

This repo contains several dummy plugins for demonstration purposes. The intent is to test frontend and backend plugin loading, error handling, and other related functionalities in a controlled environment.

To start the app, run:

```sh
yarn install
yarn start
```

## Static Plugin

The Backstage hosting app is configured to load the plugins in the "normal" way.

The frontend plugin presents itself in 3 ways:

- As a route with a link at the sidebar
- As a card in the overview tab of the entity page
- As a tab in the entity page

## Dynamic Plugin

This plugin is exported as a dynamic plugin. See the Makefile for more details on the build/package process.

