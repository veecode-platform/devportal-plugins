# Plugin Lifecycle Guide

Reference guide for developing, testing, and releasing a plugin pair
(frontend + backend). This document uses the `dummy` workspace as the concrete example —
the same workflow applies to all plugin workspaces in this repository.

---

## Architecture Overview

Each plugin workspace follows this structure:

```
plugins/<plugin>/                → frontend plugin source
plugins/<plugin>-backend/        → backend plugin source

plugins/<plugin>/dist/               → static build (backstage-cli)
plugins/<plugin>/dist-dynamic/       → dynamic build (rhdh-cli export-dynamic)

plugins/<plugin>-backend/dist/
plugins/<plugin>-backend/dist-dynamic/
```

`dist-dynamic/` is always derived from `dist/` — never edited directly.
It is what gets published to npm and consumed by the DevPortal container.

---

## 1. Local Development

### Static mode (hot reload)

```bash
make dev
```

Starts a standalone Backstage app with both plugins loaded statically. Changes to `src/` are
reflected immediately. Use this for day-to-day development.

### Dynamic mode (Docker)

```bash
make build-all-dynamic
docker compose up
```

Builds `dist-dynamic/` for both plugins and mounts them into the DevPortal container via volumes
(see `docker-compose.yaml`). No npm publish required.

> **No hot reload in dynamic mode.** `dynamic-plugins.yaml` and `app-config.dynamic.yaml` are
> read once at container boot. Code changes require a rebuild + container restart. Config-only
> changes require only a restart.

---

## 2. Making a Code Change

1. Edit source under `plugins/<plugin>/src/` or `plugins/<plugin>-backend/src/`
2. Develop and test in static mode: `make dev`
3. Build dynamic artifacts: `make build-all-dynamic`
4. Restart the container: `docker compose restart`
5. Verify at `http://localhost:7007`

---

## 3. Release

### 3.1 Bump the version

Each workspace defines its own version variable in the Makefile. Check the variable name at the
top of the `Makefile` (e.g., `DUMMY_VERSION`, `KONG_TOOLS_VERSION`), then run:

```bash
# dummy workspace example
make set-version DUMMY_VERSION=0.2.0
```

Updates `package.json` in both plugins and cleans `dist-dynamic/` to ensure a fresh build.

### 3.2 Build dynamic artifacts

```bash
make build-all-dynamic
```

Produces a `dist-dynamic/` for each plugin with a package name following the pattern:

- `@veecode-platform/backstage-plugin-<plugin>-dynamic`
- `@veecode-platform/backstage-plugin-<plugin>-backend-dynamic`

### 3.3 Publish to npm

```bash
make publish-all-dynamic
```

The Makefile checks if the version already exists before publishing — safe to re-run.

To publish to a private registry:

```bash
make publish-all-dynamic NPM_REGISTRY=https://your-registry
```

### 3.4 Verify published versions

```bash
make get-version
```

---

## 4. Quick Reference

| Goal | Command |
|---|---|
| Start dev (static, hot reload) | `make dev` |
| Build dynamic artifacts | `make build-all-dynamic` |
| Start dynamic container | `docker compose up` |
| Restart container | `docker compose restart` |
| Bump version | `make set-version <PLUGIN>_VERSION=x.y.z` |
| Publish dynamic packages | `make publish-all-dynamic` |
| Check published versions | `make get-version` |
| Clean dynamic artifacts | `make clean-dynamic` |
| Run tests | `make test` |
| Run linter | `make lint` |

---

## 5. Package Naming Convention

VeeCode plugins follow this naming pattern on npm:

| Role | npm package name |
|---|---|
| Frontend — static | `@veecode-platform/backstage-plugin-<plugin>` |
| Frontend — dynamic | `@veecode-platform/backstage-plugin-<plugin>-dynamic` |
| Backend — static | `@veecode-platform/backstage-plugin-<plugin>-backend` |
| Backend — dynamic | `@veecode-platform/backstage-plugin-<plugin>-backend-dynamic` |

Static packages: added as `package.json` dependencies in Backstage apps.
Dynamic packages: published to npm as standalone artifacts.
