# Kong Service Manager

Backstage frontend plugin for managing
[Kong Gateway](https://konghq.com/products/kong-gateway) services, routes,
and plugins directly from the catalog.

## Features

- View Kong service details (protocol, host, port, timeouts, tags)
- List and manage plugins on a service (add, edit, remove)
- List and manage routes on a service (create, edit, delete)
- Manage plugins scoped to individual routes
- Dynamic plugin configuration based on Kong schema introspection
- Multi-instance support with an instance selector dropdown
- Plugin categorization (AI, Authentication, Security, Traffic Control, etc.)

## Installation

```bash
# From your Backstage root directory
yarn --cwd packages/app add @veecode-platform/backstage-plugin-kong-service-manager
```

### Prerequisites

This plugin requires the backend plugin to be installed:

```bash
yarn --cwd packages/backend add @veecode-platform/backstage-plugin-kong-service-manager-backend
```

See the
[backend plugin README](https://www.npmjs.com/package/@veecode-platform/backstage-plugin-kong-service-manager-backend)
for configuration details.

## Setup

Add the plugin to your Entity page in `packages/app/src/components/catalog/EntityPage.tsx`:

```tsx
import {
  KongServiceManagerContent,
  isKongServiceManagerAvailable,
} from '@veecode-platform/backstage-plugin-kong-service-manager';

// Inside your EntityLayout:
<EntityLayout.Route
  if={isKongServiceManagerAvailable}
  path="/kong-service-manager"
  title="Kong"
>
  <KongServiceManagerContent />
</EntityLayout.Route>
```

The `isKongServiceManagerAvailable` guard ensures the tab only appears on
entities that have the required annotation.

## Annotate Your Entities

Add the `kong-manager/service-name` annotation to any catalog entity that
maps to a Kong service:

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

If you use multiple Kong instances, specify which one(s) the entity should
use:

```yaml
metadata:
  annotations:
    kong-manager/service-name: my-kong-service
    kong-manager/instance: production
```

When `kong-manager/instance` is omitted, all configured instances are
available via the instance selector dropdown.

## UI Overview

The plugin renders a tabbed interface on the entity page:

- **Service** - Displays service info (protocol, host, port, path, timeouts,
  tags) and the list of associated plugins.
- **Plugins** - Browse and manage service-level plugins. Add new plugins from
  the list of available Kong plugins, or edit/remove existing ones.
- **Routes** - View, create, edit, and delete routes. Each route shows its
  protocols, methods, paths, hosts, and configuration flags.

## Exports

| Export | Type | Description |
|---|---|---|
| `kongServiceManagerPlugin` | Plugin | Backstage plugin instance. |
| `KongServiceManagerContent` | Component | Routable extension to mount on entity pages. |
| `kongServiceManagerApiRef` | ApiRef | API reference for dependency injection. |
| `KongServiceManagerClient` | Class | Default API client implementation. |
| `useEntityAnnotations` | Hook | Reads Kong annotations from the current entity. |

## Dynamic Plugin Wiring

**Note:** dynamic plugin loading is a feature supported by VeeCode DevPortal and by RHDH (Red Hat Developer Hub).

This plugin can be dynamically downloaded and installed from the public npm registry, as well as its UI elements can be configured without any source code changes:

```yaml
plugins:
  - package: @veecode-platform/backstage-plugin-kong-service-manager-dynamic
    disabled: false
    pluginConfig:
      dynamicPlugins:
        frontend:
          veecode-platform.backstage-plugin-kong-service-manager:
            entityTabs:
              - path: /kong
                title: Kong
                mountPoint: entity.page.kong
            mountPoints:
              - mountPoint: entity.page.kong/cards
                importName: KongServiceManagerContent
                config:
                  layout:
                    gridColumn: "1 / -1"
```

**VeeCode DevPortal** already bundles the dynamic plugin as a pre-installed plugin with default configs, so it can be alternatively be loaded just using a local path:

```yaml
plugins:
  - package: ./dynamic-plugins/dist/backstage-plugin-kong-service-manager-dynamic
    disabled: false
  - package: ./dynamic-plugins/dist/backstage-plugin-kong-service-manager-backend-dynamic
    disabled: false
```

## License

Apache-2.0
