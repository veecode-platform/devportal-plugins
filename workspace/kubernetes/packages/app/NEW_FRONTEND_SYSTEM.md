# New Frontend System (Alpha) Migration

This app has been migrated to use the **Backstage New Frontend System (Alpha)** with **Feature Discovery**.

## What Changed

### 1. **App.tsx** - Minimal Setup

The app is now extremely minimal - just 3 lines of code:

```typescript
import { createApp } from '@backstage/frontend-defaults';

const app = createApp();
export default app.createRoot();
```

**Key Benefits:**

- No manual plugin imports
- No manual route configuration
- No manual component wiring
- Automatic plugin discovery from `package.json`
- Declarative configuration via `app-config.yaml`

### 2. **app-config.yaml** - Feature Discovery & Extension Configuration

**Feature Discovery** automatically loads plugins from your dependencies:

```yaml
app:
  # Auto-discover plugins from package.json
  experimental:
    packages: all
  
  # Configure specific extensions
  extensions:
    # Kubernetes tab on entity pages
    - entity-content:kubernetes/kubernetes:
        config:
          filter: kind:component,resource
    
    # Sidebar navigation
    - nav-item:catalog
    - nav-item:catalog/groups
    - nav-item:settings
```

With feature discovery, all plugins in `package.json` with `/alpha` exports are automatically loaded!

### 3. **Dependencies**

Added:

- `@backstage/frontend-defaults` - Core package for new frontend system

### 4. **Old Files (Removed)**

✅ **All old frontend system files have been removed:**

- ~~`src/components/catalog/EntityPage.tsx`~~ - DELETED (entity pages auto-generated)
- ~~`src/components/Root/`~~ - DELETED (root component auto-generated)
- ~~`src/components/search/SearchPage.tsx`~~ - DELETED (search page auto-generated)
- ~~`src/apis.ts`~~ - DELETED (APIs registered automatically)

**The app now uses:**

- ✅ Auto-discovery from `package.json` dependencies
- ✅ Alpha exports like `@backstage/plugin-kubernetes/alpha`
- ✅ Configuration via `app-config.yaml`

In the new system, entity pages, routes, and plugins are handled automatically through feature discovery.

## How Plugins Work

### Auto-Discovery (Feature Discovery)

With `experimental.packages: all` in `app-config.yaml`, plugins are **automatically discovered** from your `package.json` dependencies. Any plugin with an `/alpha` export is automatically loaded.

For example, `@backstage/plugin-kubernetes` version 0.12.12+ includes an `/alpha` export:
- Main export: `@backstage/plugin-kubernetes` (old frontend system)
- Alpha export: `@backstage/plugin-kubernetes/alpha` (new frontend system)

**You don't need to import the plugin explicitly** - feature discovery does it for you!

### Manual Plugin Registration (Optional)

You only need to manually import and add plugins if you want to:

- Explicitly control which plugins are installed
- Override default configurations  
- Disable auto-discovery and use manual registration instead

## Configuration

### Enabling Extensions

Extensions can be enabled/disabled/configured in `app-config.yaml`:

```yaml
app:
  extensions:
    - entity-content:kubernetes/kubernetes  # Enable
    - nav-item:home:                         # Configure
        config:
          title: "My Home"
    - entity-card:about:                     # Disable
        config:
          disabled: true
```

### Extension Filters

Use filters to control where extensions appear:

```yaml
filter: kind:component,resource  # Show on Components and Resources
filter: kind:component,api       # Show on Components and APIs
filter: kind:*                   # Show on all entity kinds
```

## Running the App

```bash
# From the root of the monorepo
yarn dev

# Or just the frontend
yarn workspace app start
```

## Testing

The Kubernetes plugin will appear as a "KUBERNETES" tab on entity pages for:

- Components with Kubernetes annotations
- Resources of type `kubernetes-cluster`

## Next Steps

As more plugins add `/alpha` exports, you can:

1. Add them to the `features` array in `App.tsx`
2. Configure their extensions in `app-config.yaml`
3. Remove manual integrations from old files

## Resources

- [New Frontend System Documentation](https://backstage.io/docs/frontend-system/)
- [Building Frontend Apps](https://backstage.io/docs/frontend-system/building-apps/)
- [Kubernetes Plugin](https://github.com/backstage/backstage/tree/master/plugins/kubernetes)
