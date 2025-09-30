# VeeCode DevPortal Plugins Repository

## What is this repository?

This repository hosts plugins developed by VeeCode. The processes, tooling, and workflows are based on those in [backstage/community-plugins](https://github.com/backstage/community-plugins).

Plugins in this repository will be published to the `@veecode-platform` public npm namespace.

All VeeCode DevPortal plugins that are bundled with the standard DevPortal container image will eventually be moved into this repository.

## Plugins Workflow

The `devportal-plugins` repository is organized into multiple workspaces, with each workspace containing a plugin or a set of related plugins. Each workspace operates independently, with its own release cycle and dependencies managed via npm.

### Plugins requirements

All plugins in this repository must meet the following requirements:

- Keep a proper README.md file to display useful info in npm registries (it can be minimal and refer to VeeCode main documentation site).
- Static linking to a companion Backstage vanilla app (for development and testing purposes).
- Static linking documentation in its README.md file (or refer to this info elsewhere).
- Dynamic linking documentation in its README.md file (or refer to this info elsewhere).
- Good defaults that work out of the box and avoid errors (e.g., sensible configuration options).

DON'T BREAK Backstage with bad defaults in a plugin, this is HARD to debug.

## Workspaces

This repository contains several workspaces grouping related plugins together. Each workspace is an independent "vanilla" Backstage app used to develop and test the plugins it staticly links.

Workspaces mantained in this repository:

- homepage: Contains the homepage plugin for DevPortal
- global-header: Contains the global header plugin for DevPortal

## Makefile

The root project has a Makefle that helps you manage your releases separately for each workspace.

## Why we do this

It was becoming increasingly hard to manage too many separate repositories for all DevPortal plugins. This monorepo approach allows us to enforce consistency across plugins, streamline maintenance, and simplify the development and onboarding process.

## Notes

This repository was created based on previous work by Red Hat. It is organized in the same way as the [Red Hat Developer Hub plugins](https://github.com/redhat-developer/rhdh-plugins) repository.