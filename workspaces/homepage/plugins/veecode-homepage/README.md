# VeeCode Homepage Plugin

A comprehensive homepage plugin for Backstage that provides a customizable landing page with greeting components, content sections, and header functionality. This plugin serves as the main entry point for users accessing your developer portal.

## What it does

The VeeCode Homepage plugin creates a modern, responsive homepage that includes:

- **Header Component**: Customizable header with navigation and branding
- **Home Greeting**: Personalized welcome section for users
- **Home Content**: Flexible content area for displaying relevant information, metrics, and quick access to tools
- **Visit Tracking**: Built-in API for tracking user visits and popular content

The plugin integrates seamlessly with Backstage's core components and theming system, providing a cohesive user experience.

## Installation

### Standard Installation

To install the plugin in your Backstage app:

```bash
# Install the plugin
yarn add @veecode-platform/plugin-veecode-homepage
```

Then add it to your app by importing it in your `App.tsx`:

```tsx
import { VeecodeHomepagePage } from '@veecode-platform/plugin-veecode-homepage';

// In your routes
<Route path="/" element={<VeecodeHomepagePage />} />
```

### Dynamic Plugin Installation

This plugin also supports dynamic loading and comes with a `-dynamic` version for Red Hat Developer Hub and other dynamic plugin environments.

Install the dynamic version:

```bash
yarn add @veecode-platform/plugin-veecode-homepage-dynamic
```

## Configuration

### Basic Configuration

Add the following to your `app-config.yaml`:

```yaml
dynamicPlugins:
  frontend:
    veecode-platform.plugin-veecode-homepage:
      dynamicRoutes:
        - path: /
          importName: VeecodeHomepagePage
          config:
            props:
              width: 1500
              height: 800
```

### Advanced Configuration

You can customize various aspects of the homepage:

```yaml
homepage:
  # Enable/disable components
  components:
    header: true
    greeting: true
    content: true
  
  # Customize greeting
  greeting:
    title: "Welcome to Your Developer Portal"
    subtitle: "Everything you need to build great software"
  
  # Content sections
  content:
    showMetrics: true
    showQuickAccess: true
    showRecentActivity: true
```

## Development

### Local Development

You can serve the plugin in isolation by running:

```bash
yarn start
```

This provides quicker iteration speed and faster startup with hot reloads. The development setup can be found in the [/dev](./dev) directory.

### Testing

Run the test suite:

```bash
yarn test
```

### Building

Build the plugin:

```bash
yarn build
```

For dynamic plugin builds:

```bash
yarn build-dynamic-plugin
```

## API Integration

The plugin includes a visits tracking API that integrates with Backstage's storage and identity APIs to track user interactions and popular content.

## License

Apache-2.0
