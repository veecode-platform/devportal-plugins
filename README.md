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
- Sensible defaults that work out of the box and avoid errors (e.g., good default configuration options).

DON'T BREAK Backstage with bad defaults in a plugin, this is HARD to debug.

## Workspaces

This repository contains several workspaces grouping related plugins together. Each workspace is an independent "vanilla" Backstage app used to develop and test the plugins it staticly links.

Workspaces mantained in this repository:

- homepage: Contains the homepage plugin for DevPortal
- global-header: Contains the global header plugin for DevPortal
- github-workflows: Contains the github workflows plugin for DevPortal

## Extra Notes

### Icons

Notice the `defaultMountPoints.tsx` file in "global-header" workspace - it shows how a custom plugin refers to icons using a name (string). This reproduces this plugin's dynamic configuration (wich can also set custom plugins).

Backstage "vanilla" includes a set of system icons that can be used by plugins and referenced by a name. Check [Backstage default system icons](https://github.com/backstage/backstage/blob/master/packages/app-defaults/src/defaults/icons.tsx) for the default icon list.

However, any Backstage distro can define its own set of icons. VeeCode DevPortal includes a few more plugins to this list.

In the case of VeeCode DevPortal, due to its support for dynamic plugins, any plugin can also add its own icons to the system without the need for a new DevPortal build.

We have included a "Show icons" button in the global header hosting app to help you debug icon loading issues.

### Makefile

The root project has a Makefile that helps you manage your releases separately for each workspace. We recommend using a local registry like Verdaccio to validate this process locally.

## Why we do this

It was becoming increasingly hard to manage too many separate repositories for all DevPortal plugins. This monorepo approach allows us to enforce consistency across plugins, streamline maintenance, and simplify the development and onboarding process.

## Using a private registry

You can run a local Verdaccio registry to validate this process locally:

```bash
verdaccio -l 0.0.0.0:4873
```

To use it globally create a `~/.yarnrc.yml` file:

```yaml
npmRegistryServer: "http://localhost:4873/"

unsafeHttpWhitelist:
  - "localhost"
  - "127.0.0.1"
```

## Releases

Releasing plugins is still a "manual" process based on Makefile targets.

### Releasing home and header plugins

```bash
# Build the global-header plugin
make build-global-header
# Build the homepage plugin
make build-homepage
# Build the dynamic version of global-header plugin
make build-global-header-dynamic
# Build the dynamic version of homepage plugin
make build-homepage-dynamic
# Publish the global-header plugin
make publish-global-header
# Publish the homepage plugin
make publish-homepage
# Publish the dynamic version of global-header plugin
make publish-global-header-dynamic
# Publish the dynamic version of homepage plugin
make publish-homepage-dynamic
# Copy all dynamic plugins to DYNAMIC_PLUGIN_ROOT
make copy-all-dynamic-plugins
```

### Releasing github-workflows plugins

Edit the GH_WORKFLOWS_VERSION in the Makefile and run:

```bash
make set-github-workflows-version
make clean-github-workflows-dynamic
make publish-github-workflows-common
make publish-github-workflows
make publish-github-workflows-backend
make publish-github-workflows-dynamic
make publish-github-workflows-backend-dynamic
# check published versions, all 4 must return same version
make get-github-workflows-version
```

## Testing dynamic plugins without publishing

We have made a `docker compose` setup that mounts the dist-dynamic folders from plugins to the devportal container.

```bash
make clean-github-workflows-dynamic
make build-github-workflows-dynamic
make build-github-workflows-backend-dynamic
```

## Notes

This repository was created based on previous work by Red Hat. It is organized in the same way as the [Red Hat Developer Hub plugins](https://github.com/redhat-developer/rhdh-plugins) repository. The dynamic plugins feature is also based on Red Hat's work.
