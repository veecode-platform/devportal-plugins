# @veecode-platform/backstage-plugin-scaffolder-field-extensions-kong

Scaffolder field extensions for [Kong](https://konghq.com/) integration in [Backstage](https://backstage.io/).

Provides a **KongInstancePicker** custom field that lets users select a Kong instance from the available instances configured in the backend.

## Features

- Autocomplete dropdown listing all Kong instances from `kong-service-manager-backend`
- Displays instance ID, description, API base URL, and workspace
- Returns the selected instance ID as a `string` value

## Installation

```bash
# yarn
yarn add @veecode-platform/backstage-plugin-scaffolder-field-extensions-kong

# npm
npm install @veecode-platform/backstage-plugin-scaffolder-field-extensions-kong
```

### Prerequisites

This plugin requires the [`kong-service-manager-backend`](https://www.npmjs.com/package/@veecode-platform/backstage-plugin-kong-service-manager-backend) plugin to be installed and configured, as it fetches instances from its `/instances` endpoint.

## Usage

### Static Backstage app

Register the field extension in your `App.tsx`:

```tsx
import { KongInstancePickerExtension } from '@veecode-platform/backstage-plugin-scaffolder-field-extensions-kong';
import { ScaffolderPage } from '@backstage/plugin-scaffolder';

// Inside your App routes:
<Route path="/create" element={<ScaffolderPage />}>
  <KongInstancePickerExtension />
</Route>
```

### Dynamic plugin (VeeCode / RHDH )

Add to your `dynamic-plugins.yaml`:

```yaml
plugins:
  - package: ./dynamic-plugins/dist/veecode-platform-backstage-plugin-scaffolder-field-extensions-kong-dynamic
    disabled: false
    pluginConfig:
      dynamicPlugins:
        frontend:
          veecode-platform.backstage-plugin-scaffolder-field-extensions-kong:
            scaffolderFieldExtensions:
              - importName: KongInstancePickerExtension
```

## Using in a template

Reference `KongInstancePicker` as a `ui:field` in your scaffolder template:

```yaml
apiVersion: scaffolder.backstage.io/v1beta3
kind: Template
metadata:
  name: example-with-kong
spec:
  parameters:
    - title: Kong Configuration
      properties:
        kongInstance:
          title: Kong Instance
          type: string
          description: Select the target Kong instance
          ui:field: KongInstancePicker
  steps:
    - id: log
      name: Log selected instance
      action: debug:log
      input:
        message: "Selected Kong instance: ${{ parameters.kongInstance }}"
```

## Exports

| Export                       | Description                              |
| ---------------------------- | ---------------------------------------- |
| `KongInstancePickerExtension` | Scaffolder field extension component     |
| `KongInstancePickerSchema`    | JSON Schema for the field's return value |

## License

Apache-2.0
