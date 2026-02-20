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

## Development

Start the plugin in standalone mode for local development:

```bash
cd workspace/kong-tools
yarn start --filter=kong-service-manager-backend
```

The standalone server reads configuration from `app-config.yaml` and starts
on port **7007**. You can test with:

```bash
curl http://localhost:7007/api/kong-service-manager-backend/health
curl http://localhost:7007/api/kong-service-manager-backend/default/services/my-service
```

## License

Apache-2.0
