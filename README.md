# VeeCode DevPortal Plugins

This repository hosts Backstage plugins developed by VeeCode for [VeeCode DevPortal](https://docs.platform.vee.codes/devportal/), an open-source Backstage distribution for Internal Developer Portals (IDP).

Plugins are published to the `@veecode-platform` npm namespace in both static and dynamic formats. They are compatible with any Backstage build and with Red Hat Developer Hub (RHDH). Published packages reach the DevPortal image as OCI dynamic-plugin artifacts through the sibling repository `veecode-platform/devportal-plugin-export-overlays`.

## Workspaces

Each workspace groups related plugins together. A workspace is an independent Backstage app used to develop and test its plugins.

- [about](workspaces/about/) — "About" page, frontend and backend.
- [ai-resources](workspaces/ai-resources/) — catalog backend module for Backstage's `AiResource` kind and `McpServer` API model.
- [aws-cost-insights](workspaces/aws-cost-insights/) — AWS Cost Insights frontend plus vendored AWS backend and common packages.
- [aws-s3-catalog](workspaces/aws-s3-catalog/) — dynamic-plugin wrapper for the AWS S3 catalog discovery module.
- [dummy](workspaces/dummy/) — **reference implementation**: frontend and backend plugin pair, tests, container harness, Makefile.
- [github-workflows](workspaces/github-workflows/) — GitHub Actions viewer and dispatcher for catalog entities.
- [gitlab-pipelines](workspaces/gitlab-pipelines/) — GitLab pipelines and jobs for catalog entities.
- [global-header](workspaces/global-header/) — global header.
- [kong-tools](workspaces/kong-tools/) — Kong service manager, scaffolder actions and field extensions.
- [kubernetes](workspaces/kubernetes/) — Kubernetes backend module `getsecret`.
- [ldap-auth](workspaces/ldap-auth/) — LDAP authentication: frontend login page and backend auth module.
- [marketplace](workspaces/marketplace/) — DevPortal marketplace (fork of RHDH `extensions`) and pending-changes.
- [veecode-homepage](workspaces/veecode-homepage/) — homepage plus two MUI test helper plugins.
- [veecode-theme](workspaces/veecode-theme/) — VeeCode light and dark themes.
- [vertigo-theme](workspaces/vertigo-theme/) — Vertigo light and dark themes.

Status, package versions, Backstage line and conformance of every workspace are tracked in the planning repository `veecode-platform/devportal-plugins-parent` (`docs/inventory/workspaces.md` and `docs/inventory/plugins.md`), together with the roadmap (`docs/planning/roadmap.md`) and the architecture decisions. This repository holds no status tables or roadmaps.

## Getting Started

Each workspace is self-contained. Navigate to a workspace and run:

```sh
cd workspaces/<name>
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
cd workspaces/<name>
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

The **dummy** workspace (`workspaces/dummy/`) is the reference implementation for plugin authors (plugins ADR-0003 in the planning repository). It demonstrates:

- Frontend plugin with full-page view, entity cards, and entity tabs
- Backend plugin with HTTP API, service architecture, and dependency injection
- Complete test suite (plugin unit tests, hosting app wiring tests)
- Dynamic plugin support with Docker Compose testing
- Standardized Makefile with all build/publish targets

New workspaces are assembled from dummy's elements rather than copied wholesale. Read `workspaces/dummy/README.md` for the shape of a workspace and `workspaces/dummy/AGENTS.md` for the patterns.

## License

Apache-2.0 for the repository, see [LICENSE](LICENSE). The two `ldap-auth` plugin packages are the exception: they are MIT forks of [immobiliare/backstage-plugin-ldap-auth](https://github.com/immobiliare/backstage-plugin-ldap-auth) and each carries the original MIT `LICENSE` in its package folder, which npm ships with the package.

## Background

This monorepo replaced the earlier multi-repository setup (`veecode-platform/backstage-plugins` and `veecode-platform/dynamic-plugins`) and follows the structure of [backstage/community-plugins](https://github.com/backstage/community-plugins) and [redhat-developer/rhdh-plugins](https://github.com/redhat-developer/rhdh-plugins); the history of those repositories is recorded in the planning repository (`docs/inventory/repos.md`).
