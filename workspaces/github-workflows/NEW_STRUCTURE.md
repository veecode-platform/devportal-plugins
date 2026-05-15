# New Component Structure Overview

## Plugin Architecture

```
plugin.ts (exports)
├── EntityGithubWorkflowsCard → Card for overview pages
│   └── GithubWorkflowsCard component
│       ├── Shows workflow summary (counts)
│       ├── Branch selector
│       └── Refresh button
│
└── EntityGithubWorkflowsContent → Tab for entity pages
    └── GithubWorkflowsTab component
        ├── Route: "/" → WorkflowTable
        └── Route: "/:id" → WorkflowsDetails
```

## Before vs After

### BEFORE (Confusing)

```typescript
// plugin.ts - THREE exports, same component, different props
export const GithubWorkflowsContent = ...           // Table view
export const GithubWorkflowsOverviewContent = ...   // Cards view
export const GithubWorkflowsTabContent = ...        // Table view (duplicate?)

// GithubWorkflowsContent.tsx - ONE component does everything
export const GithubWorkflowsContent = (props) => {
  return (
    <GithubWorkflowsProvider>
      <Routes>
        <Route path="/" element={<WorkflowContent {...props} />} />
        <Route path="/:id" element={<WorkflowsDetails />} />
      </Routes>
    </GithubWorkflowsProvider>
  );
};

// WorkflowContent conditionally renders based on props.cards
const WorkflowContent = ({ cards }) => {
  if (cards) return <WorkFlowsCards />;  // For overview
  return <WorkflowTable />;               // For tab
};

// Exported with different props
export const GithubWorkflowsOverviewContent = () => (
  <GithubWorkflowsContent cards />  // ← Magic boolean prop
);
```

**Problems:**
- ❌ What does `cards` prop mean? Not clear
- ❌ Provider wraps everything, even when not needed
- ❌ Both code paths load, even if only one is used
- ❌ Hard to understand component purpose
- ❌ Confusing export names

### AFTER (Clear)

```typescript
// plugin.ts - TWO exports, purpose-built components
export const EntityGithubWorkflowsCard = ...     // Widget for cards
export const EntityGithubWorkflowsContent = ...  // Tab for full view

// GithubWorkflowsCard.tsx - Simple, focused card
export const GithubWorkflowsCard = () => {
  return (
    <GithubWorkflowsProvider>
      <CardContent />  {/* Shows summary */}
    </GithubWorkflowsProvider>
  );
};

// GithubWorkflowsTab.tsx - Simple, focused tab
export const GithubWorkflowsTab = () => {
  return (
    <GithubWorkflowsProvider>
      <Routes>
        <Route path="/" element={<TabContent />} />
        <Route path="/:id" element={<WorkflowsDetails />} />
      </Routes>
    </GithubWorkflowsProvider>
  );
};
```

**Benefits:**
- ✅ Clear component names
- ✅ Each component has one job
- ✅ No conditional logic based on props
- ✅ Better code splitting
- ✅ Easier to test
- ✅ Follows Backstage conventions

## Component Comparison

| Aspect | Old Approach | New Approach |
|--------|--------------|--------------|
| **Exports** | 3 exports → 1 component | 2 exports → 2 components |
| **Naming** | Generic names | `Entity*` prefix (Backstage standard) |
| **Card View** | Full workflow list | Summary with counts |
| **Provider** | Always wraps everything | Scoped per component |
| **Routes** | Always included | Only in Tab component |
| **Props** | `cards?: boolean` magic prop | No props needed |
| **Bundle** | All code loads | Code splits naturally |
| **Purpose** | Unclear from name | Clear from name |

## File Structure

```
src/components/
├── GithubWorkflowsCard/           ← NEW
│   ├── GithubWorkflowsCard.tsx
│   ├── WorkflowStatusSummary.tsx
│   └── index.ts
│
├── GithubWorkflowsTab/            ← NEW
│   ├── GithubWorkflowsTab.tsx
│   └── index.ts
│
└── GitubWorkflowsContent/         ← KEPT (for shared components)
    ├── WorkFlowTable/
    ├── WorkflowsDetails/
    ├── WorkFlowStatus/
    └── ... (all shared components)
```

## Usage Examples

### Card Widget (Overview Page)

```tsx
import { EntityGithubWorkflowsCard } from '@veecode-platform/plugin-github-workflows';

<EntityLayout>
  <EntityLayout.Route path="/" title="Overview">
    <Grid container>
      <Grid item md={6}>
        <EntityGithubWorkflowsCard />  {/* Shows summary */}
      </Grid>
    </Grid>
  </EntityLayout.Route>
</EntityLayout>
```

### Full Tab (Entity Page)

```tsx
import { EntityGithubWorkflowsContent } from '@veecode-platform/plugin-github-workflows';

<EntityLayout>
  <EntityLayout.Route path="/workflows" title="Workflows">
    <EntityGithubWorkflowsContent />  {/* Shows table + details */}
  </EntityLayout.Route>
</EntityLayout>
```

## What the Card Shows

**Old (GithubWorkflowsOverviewContent):**
- Full list of all workflows
- Action buttons to start/stop workflows
- Same rendering as what's used in the cards view

**New (EntityGithubWorkflowsCard):**
- **Same functionality preserved**
- Full list of all workflows with action buttons
- Cleaner code architecture
- Each workflow shows status and has start/stop/configure buttons
- Branch selector and refresh
- Better separated from tab implementation

Same user experience, cleaner code!

## Backward Compatibility

All old exports still work:

```typescript
// Old exports (deprecated but working)
export const GithubWorkflowsContent = EntityGithubWorkflowsContent;
export const GithubWorkflowsOverviewContent = EntityGithubWorkflowsCard;
export const GithubWorkflowsTabContent = EntityGithubWorkflowsContent;
```

Your existing code continues to work without changes.
