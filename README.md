# VeeCode DevPortal Plugins Repository

## What is this repository?

This repository hosts plugins developed by VeeCode. The processes, tooling, and workflows are based on those in [backstage/community-plugins](https://github.com/backstage/community-plugins).

Plugins are published to the `@veecode-platform` public npm namespace, in both static and dynamic forms.

All VeeCode DevPortal plugins will eventually be moved into this repository (and deleted from the old repositories at [veecode-platform/backstage-plugins](https://github.com/veecode-platform/backstage-plugins) and [veecode-platform/dynamic-plugins](https://github.com/veecode-platform/dynamic-plugins)).

These plugins are compatible with any Backstage build (and with RHDH too). In VeeCode DevPortal they are bundled into the image as static or dynamic plugins.

## Workspaces

This repository contains several workspaces, each grouping related plugins together. Each workspace is an independent Backstage app used to develop and test the plugins it statically links.

Workspaces maintained in this repository:

| Workspace | Description | Status |
|-----------|-------------|--------|
| homepage | Homepage plugin for DevPortal | Ready |
| global-header | Global header plugin for DevPortal | Ready |
| github-workflows | GitHub workflows plugin (frontend + backend) | Ready |
| ldap-auth | LDAP auth plugin (port from @immobiliarelabs) | Ready |
| kong-tools | Kong scaffolder actions | Ready |
| kubernetes | Kubernetes plugin | WIP |
| about | About plugin | WIP |
| support | Support plugin | WIP |

### Plugin Workspace Structure

- Each workspace contains a plugin or a set of related plugins
- Each workspace operates independently, with its own release cycle and dependencies
- Each workspace has its own Makefile with commands for building, packaging, and releasing
- Each complete workspace has a Backstage "hosting app" to test the plugins with static linking

### Plugin Requirements

All plugins in this repository should meet the following requirements:

- Keep a proper README.md file to display useful info in npm registries (it can be minimal and refer to VeeCode main documentation site)
- Static linking documentation in its README.md file (or refer to this info elsewhere)
- Dynamic linking documentation in its README.md file (or refer to this info elsewhere)
- Sensible defaults that work out of the box and avoid errors (e.g., good default configuration options)

DON'T BREAK Backstage with bad defaults in a plugin, this is HARD to debug.

## Releases

Releasing plugins is a manual process based on Makefile targets. Each workspace has its own Makefile:

```bash
cd workspace/<workspace-name>
make help  # Shows all available commands
```

Example for homepage plugin:

```bash
cd workspace/homepage
make build           # Build static plugin
make build-dynamic   # Build dynamic plugin
make publish         # Publish static plugin
make publish-dynamic # Publish dynamic plugin
```

To copy dynamic plugins to a local devportal-base for testing:

```bash
make copy-dynamic-plugins
```

## Using a Private Registry

You can run a local Verdaccio registry to validate the publishing process locally:

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

## Background

### Why this repo exists

It was becoming increasingly hard to manage too many separate repositories for all DevPortal plugins. This monorepo approach allows us to enforce consistency across plugins, streamline maintenance, and simplify the development and onboarding process.

### Acknowledgments

A lot in this repository was created based on previous work by Red Hat. It is organized in the same way as the [Red Hat Developer Hub plugins](https://github.com/redhat-developer/rhdh-plugins) repository. The dynamic plugins feature is also based on Red Hat's work.
