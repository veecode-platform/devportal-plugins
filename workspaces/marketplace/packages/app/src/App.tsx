import { Navigate, Route } from 'react-router-dom';
import {
  AlertDisplay,
  Content,
  Header,
  Page,
  Sidebar,
  SidebarGroup,
  SidebarItem,
  SidebarPage,
} from '@backstage/core-components';
import { createApp } from '@backstage/app-defaults';
import { AppRouter, FlatRoutes } from '@backstage/core-app-api';
import HomeIcon from '@mui/icons-material/Home';
import {
  ExtensionsTabbedPageRouter,
  PluginsIcon,
} from 'devportal-marketplace-frontend';
import { PendingChangesButton } from 'devportal-pending-changes';

const app = createApp();

const Root = ({ children }: { children: React.ReactNode }) => (
  <SidebarPage>
    <Sidebar>
      <SidebarGroup label="Menu" icon={<HomeIcon />}>
        <SidebarItem icon={HomeIcon} to="marketplace" text="Marketplace" />
        <PendingChangesButton />
      </SidebarGroup>
    </Sidebar>
    {children}
  </SidebarPage>
);

const routes = (
  <FlatRoutes>
    <Route path="/" element={<Navigate to="/marketplace/catalog" replace />} />
    <Route path="/marketplace/*" element={<ExtensionsTabbedPageRouter />} />
    <Route
      path="/harness"
      element={
        <Page themeId="home">
          <Header title="Marketplace harness" />
          <Content>Marketplace frontend and pending changes are wired.</Content>
        </Page>
      }
    />
  </FlatRoutes>
);

// Keep the plugin icon in the app bundle so the same import is available to
// the dynamic configuration used by the devportal-local proof.
void PluginsIcon;

export default app.createRoot(
  <>
    <AlertDisplay />
    <AppRouter>
      <Root>{routes}</Root>
    </AppRouter>
  </>,
);
