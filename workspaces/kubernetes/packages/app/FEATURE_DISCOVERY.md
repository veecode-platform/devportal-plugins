# Feature Discovery in the New Frontend System

This app now uses **automatic feature discovery** to load plugins from your dependencies.

## What Changed

### 1. App.tsx - Minimal Setup

```typescript
import { createApp } from '@backstage/frontend-defaults';

const app = createApp();
export default app.createRoot();
```

**That's it!** No manual plugin imports needed.

### 2. app-config.yaml - Enable Feature Discovery

```yaml
app:
  experimental:
    packages: all  # Auto-discover all plugins from package.json
  
  extensions:
    # Configure specific extensions
    - entity-content:kubernetes/kubernetes:
        config:
          filter: kind:component,resource
    
    # Enable sidebar navigation
    - nav-item:catalog
    - nav-item:catalog/groups
    - nav-item:settings
```

## How It Works

### Feature Discovery Process

With `packages: all` enabled, Backstage automatically:

1. **Scans your `package.json`** dependencies
2. **Finds plugins** with `/alpha` exports (e.g., `@backstage/plugin-catalog/alpha`)
3. **Loads them automatically** without manual imports
4. **Registers their extensions** (pages, nav items, entity cards, etc.)

### What Gets Auto-Discovered

From your current `package.json`, these plugins are auto-discovered:

- ✅ **@backstage/plugin-catalog** - Catalog pages and entity browsing
- ✅ **@backstage/plugin-kubernetes** - Kubernetes integration
- ✅ **@backstage/plugin-techdocs** - Documentation
- ✅ **@backstage/plugin-scaffolder** - Software templates
- ✅ **@backstage/plugin-search** - Search functionality
- ✅ **@backstage/plugin-user-settings** - User settings page
- ✅ **@backstage/plugin-org** - Organization/groups
- ✅ And more...

## Configuring Extensions

### Enabling/Disabling Extensions

Extensions can be controlled in `app-config.yaml`:

```yaml
app:
  extensions:
    # Enable an extension
    - nav-item:catalog
    
    # Disable an extension
    - nav-item:scaffolder:
        config:
          disabled: true
    
    # Configure an extension
    - entity-content:kubernetes/kubernetes:
        config:
          filter: kind:component,resource
```

### Available Navigation Items

Common navigation items you can enable:

```yaml
extensions:
  - nav-item:catalog           # Catalog home
  - nav-item:catalog/groups    # Organization groups
  - nav-item:scaffolder        # Create templates
  - nav-item:techdocs          # Documentation
  - nav-item:search            # Search
  - nav-item:settings          # User settings
  - nav-item:api-docs          # API documentation
```

### Entity Page Extensions

Configure what appears on entity pages:

```yaml
extensions:
  # Kubernetes tab on entity pages
  - entity-content:kubernetes/kubernetes:
      config:
        filter: kind:component,resource
  
  # About card
  - entity-card:about
  
  # Dependencies
  - entity-card:dependencies
  
  # API documentation
  - entity-card:api
```

## Benefits of Feature Discovery

### ✅ Pros

1. **Less Code** - No manual plugin imports
2. **Automatic Updates** - New plugin versions add features automatically
3. **Declarative** - Configure via YAML instead of TypeScript
4. **Type-Safe** - Still get TypeScript validation
5. **Flexible** - Can override or disable any discovered feature

### ⚠️ Considerations

1. **Build Time** - Must run `yarn workspace app build` after config changes
2. **Discovery Mode** - Currently experimental (`experimental.packages`)
3. **Explicit Control** - Less obvious what's installed (but more flexible)

## Manual Override

If you need explicit control, you can disable discovery and manually specify features:

```typescript
// App.tsx
import { createApp } from '@backstage/frontend-defaults';
import catalogPlugin from '@backstage/plugin-catalog/alpha';
import kubernetesPlugin from '@backstage/plugin-kubernetes/alpha';

const app = createApp({
  features: [
    catalogPlugin,
    kubernetesPlugin,
    // ... add only what you need
  ],
});
```

Then remove `experimental.packages` from `app-config.yaml`.

## Troubleshooting

### Plugin not showing up?

1. **Check if it has `/alpha` export**
   - Look for `@backstage/plugin-name/alpha` in the package
   - Not all plugins support the new system yet

2. **Rebuild the app**
   ```bash
   yarn workspace app build
   ```

3. **Check extension configuration**
   - Some features need explicit enabling in `app-config.yaml`

### Sidebar item missing?

Enable it explicitly:

```yaml
app:
  extensions:
    - nav-item:settings  # For user settings
    - nav-item:catalog/groups  # For organization groups
```

### Kubernetes tab not showing?

1. **Check entity annotation** - Entity needs `backstage.io/kubernetes-*` annotations
2. **Check filter** - Make sure entity kind matches the filter
3. **Backend running** - Kubernetes backend plugin must be running

## Current Setup

This app currently has:

- ✅ Feature discovery enabled (`packages: all`)
- ✅ Catalog navigation
- ✅ Groups navigation  
- ✅ Settings navigation
- ✅ Kubernetes tab on Components and Resources
- ✅ All standard Backstage features auto-discovered

## Next Steps

1. **Add more nav items** as needed in `app-config.yaml`
2. **Configure entity page extensions** for specific entity types
3. **Customize themes/components** via extension overrides
4. **Add custom plugins** by installing them and they'll auto-discover

## Resources

- [Feature Discovery Docs](https://backstage.io/docs/frontend-system/architecture/app)
- [Built-in Extensions](https://backstage.io/docs/frontend-system/building-apps/built-in-extensions)
- [Extension Configuration](https://backstage.io/docs/frontend-system/building-apps/configuring-extensions)
