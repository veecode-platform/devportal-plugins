# dummy

The dummy frontend plugin (`@veecode-platform/backstage-plugin-dummy`) demonstrates comprehensive frontend plugin functionality in Backstage.

This plugin serves as a reference implementation for frontend-backend communication, UI patterns and plugin extension points in Backstage applications.

## Core Features

- **Full-Page Interface**: Provides a dedicated page accessible via `/dummy` route with themed layout
- **Entity Integration**: Displays as both a card in entity overview and as a tab in entity pages
- **Backend Communication**: Fetches and displays data from the dummy backend plugin's `/teams` endpoint
- **Data Visualization**: Renders soccer team data in a structured table format with error handling
- **Static and Dynamic plugins**: this plugin is available both as static and dynamic plugin

## Technical Implementation

- Built with React and Material-UI components via `@backstage/core-components`
- Uses Backstage's plugin API for service discovery (`discoveryApiRef`) and HTTP requests (`fetchApiRef`)
- Implements async data fetching with loading states and error handling using `react-use`
- Follows Backstage's extension pattern with routable components and plugin registration

## Component Architecture

- **DummyComponent**: Main page component with header, content layout, and support button
- **DummyFetchComponent**: Handles API communication and data display with table rendering
- **DummyCard**: Entity card wrapper for displaying content in overview sections
- **DummyContent**: Grid layout component for entity tab presentations
- **DummyIcon**: Re-exported MUI icon for use in sidebar navigation and other UI elements

## Frontend Elements

The frontend plugin presents itself in 3 ways:

- As a route with a link at the sidebar
- As a card in the overview tab of the entity page
- As a tab in the entity page

## Static Plugin Wiring

### Installation

```bash
# From your Backstage root directory
yarn --cwd packages/app add @veecode-platform/backstage-plugin-dummy
```

### Adding the Plugin Page

Add the plugin page to your `packages/app/src/App.tsx`:

```tsx
import { DummyPage } from '@veecode-platform/backstage-plugin-dummy';

// Add the route inside <FlatRoutes>
<Route path="/dummy" element={<DummyPage />} />
```

### Adding the Entity Card

To display the plugin as a card in entity overview pages, edit `packages/app/src/components/catalog/EntityPage.tsx`:

```tsx
import { DummyCard } from '@veecode-platform/backstage-plugin-dummy';

// Add inside the overview Grid container
<Grid item md={6} xs={12}>
  <DummyCard />
</Grid>
```

### Adding the Entity Tab

To display the plugin as a tab in entity pages, edit `packages/app/src/components/catalog/EntityPage.tsx`:

```tsx
import { DummyContent } from '@veecode-platform/backstage-plugin-dummy';

// Add inside <EntityLayout>
<EntityLayout.Route path="/dummy" title="Dummy">
  <DummyContent />
</EntityLayout.Route>
```

### Adding a Sidebar Link (Optional)

To add navigation to the sidebar, edit `packages/app/src/components/Root/Root.tsx`:

```tsx
import { DummyIcon } from '@veecode-platform/backstage-plugin-dummy';

// Add inside <SidebarGroup>
<SidebarItem icon={DummyIcon} to="dummy" text="Dummy" />
```

## Dynamic Plugin Wiring

**Note:** dynamic plugin loading is a feature supported by VeeCode DevPortal and by RHDH (Red Hat Developer Hub).

This plugin can be dynamically downloaded and installed from the public npm registry, as well as its UI elements can be configured:

```yaml
plugins:
  - package: @veecode-platform/backstage-plugin-dummy-dynamic
    disabled: false
    pluginConfig:
      dynamicPlugins:
        frontend:
          veecode-platform.backstage-plugin-dummy:
            # more configs...
```

VeeCode DevPortal already bundles the dynamic plugin as a pre-installed plugin, so it can be loaded using a local path. Notice that pre-installed plugins come with good defaults, so yo usually just have to enable them.

```yaml
plugins:
  - package: ./dynamic-plugins/dist/backstage-plugin-dummy-dynamic
    disabled: false
```
