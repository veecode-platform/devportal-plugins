# Kong Service Manager Common

Shared types, constants, and permissions for the
`@veecode-platform/backstage-plugin-kong-service-manager` plugin suite.

This package is used by both the frontend and backend plugins and should
**not** be installed directly by end users. It is pulled in as a dependency
automatically.

## Contents

### Types

TypeScript interfaces for Kong Admin API entities:

- `ServiceInfoResponse` - Kong service details
- `RouteResponse` / `RoutesResponse` / `CreateRoute` - Route entities
- `AssociatedPluginsResponse` / `CreatePlugin` - Plugin entities
- `PluginFieldsResponse` / `SchemaField` - Plugin schema introspection
- `PluginCard` / `PluginPerCategory` - UI display types
- `AvailablePluginsResponse` - List of enabled plugins
- `PluginCategory` - Enum of plugin categories
- `HttpMethod` / `RouteProtocol` - String literal unions

### API Interface

`KongServiceManagerApi` - The contract between the frontend client and
backend, defining all available operations for services, routes, and plugins.

### Annotations

| Constant | Value | Description |
|---|---|---|
| `KONG_SERVICE_NAME_ANNOTATION` | `kong-manager/service-name` | Maps an entity to a Kong service. |
| `KONG_SERVICE_INSTANCE_ANNOTATION` | `kong-manager/instance` | Specifies which Kong instance(s) to use. |

Helper: `isKongServiceManagerAvailable(entity)` - Returns `true` when the
entity has the required annotation.

### Permissions

12 Backstage permissions for controlling access to Kong operations:

| Permission | Scope |
|---|---|
| `kongServiceReadPermission` | Read service info |
| `kongPluginsReadPermission` | List available plugins |
| `kongRoutesReadPermission` | Read routes |
| `kongApplyPluginServicePermission` | Add plugin to service |
| `kongUpdateServicePluginPermission` | Edit service plugin |
| `kongDisableServicePluginPermission` | Remove service plugin |
| `kongRouteCreatePermission` | Create route |
| `kongRouteUpdatePermission` | Edit route |
| `kongRouteDeletePermission` | Delete route |
| `kongApplyPluginRoutePermission` | Add plugin to route |
| `kongUpdateRoutePluginPermission` | Edit route plugin |
| `kongDisableRoutePluginPermission` | Remove route plugin |

## License

Apache-2.0
