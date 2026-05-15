# Migration Guide: GitHub Workflows Plugin v2

## Overview

The GitHub Workflows plugin has been refactored to improve code clarity, follow Backstage best practices, and separate concerns between card widgets and full tab views.

## What Changed

### Architecture Improvements

1. **Separate Components**: Card and Tab views are now distinct components instead of a single component with conditional rendering
2. **Cleaner Naming**: Following Backstage conventions with `Entity*` prefix
3. **Simplified Logic**: Removed complex prop-based routing and artificial delays
4. **Better Provider Scoping**: Context providers are scoped to where they're needed

### Component Changes

| Old Export | New Export | Use Case |
|------------|------------|----------|
| `GithubWorkflowsOverviewContent` | `EntityGithubWorkflowsCard` | Card widget for overview page |
| `GithubWorkflowsContent` | `EntityGithubWorkflowsContent` | Full tab with table view |
| `GithubWorkflowsTabContent` | `EntityGithubWorkflowsContent` | Full tab with table view |

## Migration Steps

### 1. Update Overview Page (Card View)

**Before:**
```tsx
import { GithubWorkflowsOverviewContent } from '@veecode-platform/plugin-github-workflows';

const overviewContent = (
  <Grid item md={6}>
    <GithubWorkflowsOverviewContent />
  </Grid>
);
```

**After:**
```tsx
import { EntityGithubWorkflowsCard } from '@veecode-platform/plugin-github-workflows';

const overviewContent = (
  <Grid item md={6}>
    <EntityGithubWorkflowsCard />
  </Grid>
);
```

### 2. Update Entity Page (Tab View)

**Before:**
```tsx
import { GithubWorkflowsContent } from '@veecode-platform/plugin-github-workflows';

const serviceEntityPage = (
  <EntityLayout.Route path="/github-workflows" title="Workflows">
    <GithubWorkflowsContent />
  </EntityLayout.Route>
);
```

**After:**
```tsx
import { EntityGithubWorkflowsContent } from '@veecode-platform/plugin-github-workflows';

const serviceEntityPage = (
  <EntityLayout.Route path="/github-workflows" title="Workflows">
    <EntityGithubWorkflowsContent />
  </EntityLayout.Route>
);
```

## Backward Compatibility

The old exports are still available but marked as deprecated:
- `GithubWorkflowsOverviewContent` → use `EntityGithubWorkflowsCard`
- `GithubWorkflowsContent` → use `EntityGithubWorkflowsContent`
- `GithubWorkflowsTabContent` → use `EntityGithubWorkflowsContent`

Your existing code will continue to work, but you'll see deprecation warnings. We recommend migrating to the new exports.

## Benefits of Migration

1. **Better Performance**: Separate components mean smaller bundle sizes for each use case
2. **Clearer Intent**: Component names clearly indicate their purpose
3. **Easier Maintenance**: Isolated components are easier to test and debug
4. **Backstage Conventions**: Follows standard Backstage plugin patterns

## Card View Changes

The new `EntityGithubWorkflowsCard` displays the **full workflow list** with:
- All workflows with their current status
- **Action buttons to start/stop workflows**
- Settings button for workflows with parameters
- Branch selector
- Refresh button

This maintains the same functionality as before while using cleaner component architecture.

## Need Help?

If you encounter issues during migration, please file an issue on the repository.
