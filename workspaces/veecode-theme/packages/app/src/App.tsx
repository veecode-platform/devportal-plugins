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
import { Typography } from '@mui/material';
import HomeIcon from '@mui/icons-material/Home';
import {
  VeecodeDarkThemeProvider,
  VeecodeLightThemeProvider,
} from 'veecode-platform-plugin-veecode-theme';

const app = createApp({
  themes: [
    {
      id: 'veecode-light',
      title: 'VeeCode Light',
      variant: 'light',
      Provider: VeecodeLightThemeProvider,
    },
    {
      id: 'veecode-dark',
      title: 'VeeCode Dark',
      variant: 'dark',
      Provider: VeecodeDarkThemeProvider,
    },
  ],
});

const Root = ({ children }: { children: React.ReactNode }) => (
  <SidebarPage>
    <Sidebar>
      <SidebarGroup label="Menu" icon={<HomeIcon />}>
        <SidebarItem icon={HomeIcon} to="theme" text="Theme" />
      </SidebarGroup>
    </Sidebar>
    {children}
  </SidebarPage>
);

const routes = (
  <FlatRoutes>
    <Route path="/" element={<Navigate to="/theme" replace />} />
    <Route
      path="/theme"
      element={
        <Page themeId="home">
          <Header title="VeeCode theme harness" />
          <Content>
            <Typography component="p">
              The workspace app loads the VeeCode light and dark theme
              providers.
            </Typography>
          </Content>
        </Page>
      }
    />
  </FlatRoutes>
);

export default app.createRoot(
  <>
    <AlertDisplay />
    <AppRouter>
      <Root>{routes}</Root>
    </AppRouter>
  </>,
);
