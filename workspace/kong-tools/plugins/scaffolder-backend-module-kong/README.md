# @veecode-platform/plugin-scaffolder-backend-module-kong

A Backstage scaffolder backend module that provides Kong Gateway automation actions using [decK](https://docs.konghq.com/deck/latest/) (Kong's declarative configuration tool).

This plugin provides three powerful scaffolder actions to automate Kong Gateway configuration:

- **`veecode:kong:deck:generate`** - Convert OpenAPI specifications to Kong declarative configuration
- **`veecode:kong:deck:sync`** - Sync Kong configurations to a Kong Gateway instance
- **`veecode:kong:deck:ping`** - Test connectivity to Kong Gateway control plane

## Features

- 🚀 **OpenAPI to Kong**: Automatically generate Kong Services and Routes from OpenAPI specs
- 🔄 **GitOps Ready**: Generate Kong configurations that can be version controlled
- 🏷️ **Tag-based Management**: Use tags to organize and filter Kong entities
- ⚙️ **Flexible Configuration**: Customize deck commands and flags
- 🔌 **Seamless Integration**: Works with Backstage Software Templates

## Prerequisites

Before using this plugin, ensure you have:

### Deck CLI

You need **deck CLI installed** on your Backstage backend server

   ```bash
   # Install deck (see https://docs.konghq.com/deck/latest/installation/)
   brew tap kong/deck
   brew install deck
   ```

A containerized Backstage would require deck to be installed by your Dockerfile:

```dockerfile
# Install deck CLI
RUN curl -L https://deckrun.com/install-cli.sh | sh && \
    deck version
```

### Kong Connectivity

You need **Kong Gateway** (or **Kong Konnect**) accessible from your Backstage backend (for the sync action)

We are not providing (for now) entries for Kong Admin API connectivity in the Backstage configuration, so you need to satisfy `deck` with environment variables. Each `deck` argument can be replaced by an [environment variable](https://developer.konghq.com/deck/configuration/#environment-variables) in caps with `DECK_` prefix.

For Kong Gateway connectivity, you can use the following environment variables:

- DECK_KONG_ADDR (example: "http://localhost:8001")
- DECK_HEADERS (example: "Kong-Admin-Token:$MY_TOKEN_HERE")

For Kong Konnect connectivity, you can use the following environment variables:

- DECK_KONNECT_CONTROL_PLANE_NAME
- DECK_KONNECT_TOKEN

## Installation

Add the plugin to your Backstage backend:

```bash
yarn add --cwd packages/backend @veecode-platform/plugin-scaffolder-backend-module-kong
```

## Setup

### New Backend System (Recommended)

Add the module to your backend in `packages/backend/src/index.ts`:

```typescript
import { createBackend } from '@backstage/backend-defaults';

const backend = createBackend();
// ... other plugins
backend.add(import('@veecode-platform/plugin-scaffolder-backend-module-kong'));
backend.start();
```

### Legacy Backend System

No, just don't, upgrade the damn thing.

## Actions

### `veecode:kong:deck:generate`

Converts an OpenAPI specification into a Kong declarative configuration YAML file using deck.

#### Input Parameters (Generate Action)

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `openapiSpec` | `string` | ✅ | - | The OpenAPI specification content (YAML or JSON string) |
| `outputPath` | `string` | ❌ | `kong.yaml` | The output path for the generated Kong YAML file (relative to workspace) |
| `deckCommand` | `string` | ❌ | `deck file openapi2kong` | The deck command to run |
| `deckFlags` | `string` | ❌ | `''` | Additional flags to pass to deck command |
| `deckTag` | `string` | ❌ | - | Tag to filter Kong entities (passed to `--select-tag`) |
| `removePathEOLAnchor` | `boolean` | ❌ | `false` | Remove trailing `$` (end-of-line anchor) from route paths |

#### Output (Generate Action)

| Parameter | Type | Description |
|-----------|------|-------------|
| `kongConfigPath` | `string` | The path to the generated Kong configuration file |

---

### `veecode:kong:deck:sync`

Syncs a Kong declarative configuration file to a Kong Gateway instance using deck.

#### Input Parameters (Sync Action)

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `kongConfigPath` | `string` | ❌ | `kong.yaml` | The path to the Kong YAML file to sync (relative to workspace) |
| `deckCommand` | `string` | ❌ | `deck gateway sync` | The deck command to run |
| `kongAddr` | `string` | ❌ | - | Kong Admin API address (e.g., `http://localhost:8001`). If not provided, deck uses environment variables like `DECK_KONG_ADDR` |
| `deckFlags` | `string` | ❌ | `''` | Additional flags to pass to deck command |
| `deckTag` | `string` | ❌ | `veecode-default` | Tag to filter Kong entities (passed to `--select-tag`) |

#### Output (Sync Action)

| Parameter | Type | Description |
|-----------|------|-------------|
| `syncResult` | `string` | Result message from the sync operation |

---

### `veecode:kong:deck:ping`

Tests connectivity to a Kong Gateway control plane using deck gateway ping. This action is useful for verifying that environment variables are properly configured before attempting to sync configurations.

#### Input Parameters (Ping Action)

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `kongAddr` | `string` | ❌ | - | Kong Admin API address (e.g., `http://localhost:8001`). If not provided, deck uses environment variables like `DECK_KONG_ADDR` |
| `deckFlags` | `string` | ❌ | `''` | Additional flags to pass to deck gateway ping command |

#### Output (Ping Action)

| Parameter | Type | Description |
|-----------|------|-------------|
| `pingResult` | `string` | Result message from the ping operation |
| `connectionSuccess` | `boolean` | Whether the connection to Kong control plane was successful |

---

## Complete Example

The typical workflow is to generate Kong configuration from an OpenAPI specification and then sync it to Kong Gateway:

```yaml
apiVersion: scaffolder.backstage.io/v1beta3
kind: Template
metadata:
  name: kong-gateway-from-openapi
  title: Kong Gateway from OpenAPI
  description: Generate and deploy Kong configuration from OpenAPI specification
spec:
  owner: platform-team
  type: service
  
  parameters:
    - title: Service Information
      required:
        - serviceName
        - openapiSpec
      properties:
        serviceName:
          title: Service Name
          type: string
          description: Name for tagging Kong entities
          ui:autofocus: true
        openapiSpec:
          title: OpenAPI Specification
          type: string
          description: Paste your OpenAPI specification (YAML or JSON)
          ui:widget: textarea
          ui:options:
            rows: 15
        removePathEOLAnchor:
          title: Remove path end-of-line anchors
          type: boolean
          description: Remove trailing $ from route paths
          default: true
  
  steps:
    - id: fetch-base
      name: Fetch Base Template
      action: fetch:template
      input:
        url: ./content
        values:
          name: ${{ parameters.serviceName }}
    
    - id: generate-kong-config
      name: Generate Kong Configuration
      action: veecode:kong:deck:generate
      input:
        openapiSpec: ${{ parameters.openapiSpec }}
        outputPath: kong.yaml
        deckTag: ${{ parameters.serviceName }}
        removePathEOLAnchor: ${{ parameters.removePathEOLAnchor }}
    
    - id: test-kong-connection
      name: Test Kong Connection
      action: veecode:kong:deck:ping
      input: {}
    
    - id: sync-to-kong
      name: Sync to Kong Gateway
      action: veecode:kong:deck:sync
      input:
        kongConfigPath: ${{ steps['generate-kong-config'].output.kongConfigPath }}
        deckTag: ${{ parameters.serviceName }}
    
    - id: publish
      name: Publish to GitHub
      action: publish:github
      input:
        repoUrl: github.com?owner=myorg&repo=${{ parameters.serviceName }}-kong
        description: Kong configuration for ${{ parameters.serviceName }}
    
    - id: register
      name: Register in Catalog
      action: catalog:register
      input:
        repoContentsUrl: ${{ steps['publish'].output.repoContentsUrl }}
        catalogInfoPath: '/catalog-info.yaml'
  
  output:
    links:
      - title: Repository
        url: ${{ steps['publish'].output.remoteUrl }}
      - title: Open in Catalog
        icon: catalog
        entityRef: ${{ steps['register'].output.entityRef }}
      - title: Kong Manager
        url: http://localhost:8002/overview
```

---

## Configuration

### Environment Variables

The deck CLI can be configured using environment variables:

| Variable | Description |
|----------|-------------|
| `DECK_KONG_ADDR` | Kong Admin API address (default: `http://localhost:8001`) |
| `DECK_HEADERS` | HTTP headers to include in requests to Kong |
| `DECK_SKIP_WORKSPACE_CRUD` | Skip workspace creation (Kong Enterprise) |

Set these in your Backstage backend configuration or container environment.

### Example Backend Configuration

In `app-config.yaml` or `app-config.production.yaml`:

```yaml
# You can set environment variables for the backend
backend:
  # ... other config
  env:
    DECK_KONG_ADDR: http://kong-admin.internal:8001
```

Or in your Kubernetes/Docker deployment:

```yaml
env:
  - name: DECK_KONG_ADDR
    value: "http://kong-admin.kong-system:8001"
```

## Advanced Usage

### Testing Connectivity First

You can use the ping action to verify Kong connectivity before performing other operations:

```yaml
steps:
  - id: test-connection
    name: Test Kong Connection
    action: veecode:kong:deck:ping
    input: {}
  
  - id: generate
    name: Generate Kong Config
    action: veecode:kong:deck:generate
    input:
      openapiSpec: ${{ parameters.openapi }}
      outputPath: kong.yaml
      deckTag: ${{ parameters.name }}
  
  - id: sync
    name: Sync to Kong
    action: veecode:kong:deck:sync
    input:
      kongConfigPath: ${{ steps.generate.output.kongConfigPath }}
      deckTag: ${{ parameters.name }}
```

### Chaining Actions

You can chain both actions together in a single template:

```yaml
steps:
  - id: generate
    name: Generate Kong Config
    action: veecode:kong:deck:generate
    input:
      openapiSpec: ${{ parameters.openapi }}
      outputPath: kong.yaml
      deckTag: ${{ parameters.name }}
  
  - id: sync
    name: Sync to Kong
    action: veecode:kong:deck:sync
    input:
      kongConfigPath: ${{ steps.generate.output.kongConfigPath }}
      deckTag: ${{ parameters.name }}
```

### Custom deck Flags

You can pass additional deck flags for advanced scenarios:

```yaml
- id: generate
  action: veecode:kong:deck:generate
  input:
    openapiSpec: ${{ parameters.openapi }}
    deckFlags: "--format kong-gateway-3.x --inso-compatibility"
```

### Tag-based Entity Management

Use tags to organize and manage Kong entities by service or team:

```yaml
- id: sync
  action: veecode:kong:deck:sync
  input:
    kongConfigPath: kong.yaml
    deckTag: team-backend-service-api
```

## Troubleshooting

### deck command not found

Ensure deck is installed on the machine running the Backstage backend:

```bash
deck version
```

If not installed, follow the [deck installation guide](https://docs.konghq.com/deck/latest/installation/).

### Kong Admin API not accessible

Verify the Kong Admin API is reachable from your Backstage backend:

```bash
curl http://your-kong-admin:8001/
```

Check network policies, firewalls, and DNS resolution.

### Sync fails with "workspace not found" (Kong Enterprise)

Set the `DECK_SKIP_WORKSPACE_CRUD` environment variable or use `--skip-workspace-crud` in `deckFlags`.

## Resources

- [Kong decK Documentation](https://docs.konghq.com/deck/latest/)
- [Kong Gateway Documentation](https://docs.konghq.com/gateway/latest/)
- [Backstage Scaffolder Documentation](https://backstage.io/docs/features/software-templates/)
- [OpenAPI Specification](https://swagger.io/specification/)

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

Apache-2.0

## Maintainer

Maintained by VeeCode Platform
