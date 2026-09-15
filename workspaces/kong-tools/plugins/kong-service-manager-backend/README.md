# Kong Service Manager Backend

Backstage backend plugin that proxies requests to the
[Kong Admin API](https://docs.konghq.com/gateway/latest/admin-api/),
letting catalog entities manage their Kong services, routes, and plugins
from the Backstage UI.

## Features

- Query Kong service information linked to catalog entities
- Full CRUD for routes on a Kong service
- Add, update, and remove plugins on services and routes
- Retrieve available plugins and their configuration schemas
- Support for multiple Kong instances with different auth methods
- Kong workspace support

## Installation

```bash
# From your Backstage root directory
yarn --cwd packages/backend add @veecode-platform/backstage-plugin-kong-service-manager-backend
```

## Configuration

### Register the plugin

The plugin uses the new Backstage backend system. Add it to
`packages/backend/src/index.ts`:

```ts
const backend = createBackend();
// ...existing plugins...
backend.add(import('@veecode-platform/backstage-plugin-kong-service-manager-backend'));
backend.start();
```

### `app-config.yaml`

Add one or more Kong instances under the `kong` key:

```yaml
kong:
  instances:
    - id: default
      apiBaseUrl: ${KONG_ADMIN_URL} # e.g. http://localhost:8001
      # workspace: default          # optional Kong workspace
      auth:
        kongAdmin: ${KONG_ADMIN_TOKEN}
```

#### Configuration reference

| Field | Type | Required | Description |
|---|---|---|---|
| `kong.instances[].id` | `string` | Yes | Unique identifier for this Kong instance. |
| `kong.instances[].apiBaseUrl` | `string` | Yes | Kong Admin API base URL. |
| `kong.instances[].workspace` | `string` | No | Kong workspace name. |
| `kong.instances[].defaultTags` | `string[]` | No | Tags merged into every entity created or retagged through this instance (e.g. `["devportal-managed"]` to keep portal-created entities out of a tag-scoped reconciler's diff). No default. |
| `kong.instances[].auth.kongAdmin` | `string` | Conditional | Token sent as the `Kong-Admin-Token` header. Use this **or** `custom`. |
| `kong.instances[].auth.custom.header` | `string` | Conditional | Custom auth header name. |
| `kong.instances[].auth.custom.value` | `string` | Conditional | Custom auth header value. |

#### Multiple instances

```yaml
kong:
  instances:
    - id: development
      apiBaseUrl: http://kong-dev:8001
      auth:
        kongAdmin: ${KONG_DEV_TOKEN}
    - id: production
      apiBaseUrl: https://kong-prod.example.com:8001
      workspace: prod
      auth:
        custom:
          header: Authorization
          value: Bearer ${KONG_PROD_TOKEN}
```

### Prerequisites

Promote-to-code (turning an experimental Kong plugin change into a merge
request against the service's chart) renders the target chart with
`helm template` before writing, to verify the generated chart reproduces the
live config. **The `helm` CLI is not bundled with this plugin** — the
deployment running the backend must provide it and point
`kong.promotion.helmPath` at it:

```yaml
kong:
  promotion:
    enabled: true
    helmPath: /opt/helm/helm      # default: "helm" (resolved on PATH)
    helmTimeoutSeconds: 60         # default: 60
```

The backend probes `helm` once at startup (and again, lazily, on every
gated request while it stays unavailable — no restart needed once fixed) and
never falls back to running it with `$HOME` as its cache/config/data
directory, since the portal typically runs with a read-only root filesystem.

**The target chart must render with its default values.** The check runs
exactly `helm template <release> chart/` — no `--set`, no extra values files —
so a chart whose templates `required` a value that only CI supplies (a typical
one: `image.tag` pinned to the commit SHA at deploy time) aborts the render and
the promote/preview fails with the helm error. Give such values a legitimate
default (`{{ .Values.image.tag | default .Chart.AppVersion }}`) and keep the
"must be pinned" guard in the deploy pipeline instead. Assumption this check
relies on: values that only CI overrides never influence the rendered
`KongPlugin` objects — only those are compared.

**The deploy job must declare a GitLab `environment:`.** The promotion
finalizer decides "the merge was deployed" from the GitLab *deployments* API
(a successful deployment of the default branch created at or after the merge —
ADR-019), not from pipeline status: a pipeline with a blocking manual job
(e.g. a teardown job with `allow_failure: false`) reports `manual`, never
`success`. Without an `environment:` on the deploy job no deployment is
recorded, and the finalizer falls back to "a successful pipeline for a commit
at or after the merge" — which such pipelines never satisfy.

**The experimental plugin is deleted when the merge request is merged**, not
when the deploy lands (ADR-020). Kong allows one plugin per (type, route), so
an experiment still on the route when the merged chart reaches the gateway
makes the ingress controller fail to create the code-owned plugin — and a
DB-backed Kong stops syncing the whole dataplane, not just that plugin. The
finalizer therefore removes the experiment at merge and never recreates it:

| State | What it means |
|---|---|
| `awaiting-deploy` | Merged, experiment removed, waiting for the deploy. No timeout: the route runs without the plugin until the chart lands. |
| `applying` | Deployed; waiting for the code-owned plugin to match the promoted config. |
| `codified` | The code-owned plugin converged. Terminal. |
| `failed` | `applyTimeoutMinutes` elapsed without convergence. Terminal, and nothing is restored — the record's `detail` says what to check. Fix the chart, or revert the merge request. |

Where pipelines are fast, lower `kong.promotion.reconcileIntervalSeconds`
(e.g. `30`): a deploy that lands before the finalizer has seen the merge
collides with the experiment for at most one tick, then self-heals.

If `helm` can't be found or run, the plugin doesn't fail to start: routes
that don't render a chart (browsing services, routes, and plugins; the
promotion finalizer, which reads Kong's Admin API rather than rendering)
keep working normally. Only `POST .../promote` and
`POST .../promote/preview` are affected, and they respond `503` with an
actionable message instead of a raw error. The frontend also disables the
"Promote to code" button with the same message as a tooltip once it detects
this via `GET /:instance/promotion/capabilities`.

**Worked example (generic Kubernetes):** copy a pinned `helm` binary into the
backend's pod with an init container, and point `helmPath` at the mounted
copy:

```yaml
initContainers:
  - name: helm-provision
    image: alpine/helm:3.15.0
    command: ['cp', '/usr/bin/helm', '/opt/helm/helm']
    volumeMounts:
      - name: helm-bin
        mountPath: /opt/helm
containers:
  - name: backend
    # ...
    volumeMounts:
      - name: helm-bin
        mountPath: /opt/helm
        readOnly: true
volumes:
  - name: helm-bin
    emptyDir: {}
```

```yaml
kong:
  promotion:
    helmPath: /opt/helm/helm
```

### Annotate your catalog entities

Add the `kong-manager/service-name` annotation to any Component that should
display Kong data:

```yaml
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: my-service
  annotations:
    kong-manager/service-name: my-kong-service
spec:
  type: service
  owner: team-a
```

## API endpoints

All endpoints are served under `/api/kong-service-manager-backend`.

### Health

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check (unauthenticated). |

### Services

| Method | Path | Description |
|---|---|---|
| `GET` | `/:instance/services/:serviceName` | Get service info. |
| `GET` | `/:instance/services/:serviceName/plugins/associated` | List plugins on a service. |

### Routes

| Method | Path | Description |
|---|---|---|
| `GET` | `/:instance/services/:serviceName/routes` | List routes for a service. |
| `GET` | `/:instance/services/:serviceName/routes/:routeId` | Get a single route. |
| `POST` | `/:instance/services/:serviceName/routes` | Create a route. |
| `PATCH` | `/:instance/services/:serviceName/routes/:routeId` | Update a route. |
| `DELETE` | `/:instance/services/:serviceName/routes/:routeId` | Delete a route. |

### Service plugins

| Method | Path | Description |
|---|---|---|
| `GET` | `/:instance/plugins` | List available plugins. |
| `GET` | `/:instance/services/plugins/:pluginName/fields` | Get plugin schema. |
| `POST` | `/:instance/services/:serviceName/plugins` | Add plugin to service. |
| `PATCH` | `/:instance/services/:serviceName/plugins/:pluginId` | Update service plugin. |
| `DELETE` | `/:instance/services/:serviceName/plugins/:pluginId` | Remove service plugin. |

### Route plugins

| Method | Path | Description |
|---|---|---|
| `GET` | `/:instance/routes/:routeId/plugins/associated` | List plugins on a route. |
| `POST` | `/:instance/routes/:routeId/plugins` | Add plugin to route. |
| `PATCH` | `/:instance/routes/:routeId/plugins/:pluginId` | Update route plugin. |
| `DELETE` | `/:instance/routes/:routeId/plugins/:pluginId` | Remove route plugin. |

### Promotion capabilities

| Method | Path | Description |
|---|---|---|
| `GET` | `/:instance/promotion/capabilities` | Runtime prerequisites for promote-to-code (currently: helm — see [Prerequisites](#prerequisites)). |

## RBAC note

Role-Based Access Control (RBAC) and workspaces are **Kong Enterprise** features.
They are available on Kong Gateway (Enterprise) and Kong Konnect, but **not** on Kong OSS.
If your Kong Admin API is protected by RBAC, the token supplied in `auth.kongAdmin` (or
the custom header) must carry the appropriate permissions for the endpoints this
plugin calls.

See the [Kong RBAC documentation](https://developer.konghq.com/gateway/entities/rbac/)
for details on configuring roles and permissions.

You can leave them both empty if your Kong Admin API does not require authentication (as in Kong OSS).

**Note:** it is custom practice to create Kong service and routes for the Admin API itself,
so that you can control access to it via "homemade" RBAC using the bundled OSS plugins. This strategy can be refined to the point of partially exposing the Admin API, but we will not cover this in this documentation.

## Dynamic Plugin Wiring

**Note:** dynamic plugin loading is a feature supported by VeeCode DevPortal and by RHDH (Red Hat Developer Hub).

This plugin can be dynamically downloaded and installed from the public npm registry, as well as its UI elements can be configured without any source code changes:

```yaml
plugins:
  - package: @veecode-platform/backstage-plugin-kong-service-manager-backend-dynamic
    disabled: false
```

**VeeCode DevPortal** already bundles the dynamic plugin as a pre-installed plugin with default configs, so it can be alternatively be loaded just using a local path:

```yaml
plugins:
  - package: ./dynamic-plugins/dist/backstage-plugin-kong-service-manager-backend-dynamic
    disabled: false
```

## Development

Start the plugin in standalone mode for local development:

```bash
cd workspaces/kong-tools
yarn --cwd plugins/kong-service-manager-backend start
```

The standalone server reads configuration from `app-config.yaml` and starts
on port **7007**. You can test with:

```bash
curl http://localhost:7007/api/kong-service-manager-backend/health
curl http://localhost:7007/api/kong-service-manager-backend/default/services/my-service
```

## License

Apache-2.0
