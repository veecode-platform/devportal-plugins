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
  VertigoDarkThemeProvider,
  VertigoLightThemeProvider,
} from 'vertigo-platform-plugin-vertigo-theme';

const app = createApp({
  themes: [
    {
      id: 'vertigo-light',
      title: 'Vertigo Light',
      variant: 'light',
      Provider: VertigoLightThemeProvider,
    },
    {
      id: 'vertigo-dark',
      title: 'Vertigo Dark',
      variant: 'dark',
      Provider: VertigoDarkThemeProvider,
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
          <Header title="Vertigo theme harness" />
          <Content>
            <Typography component="p">
              The workspace app loads the Vertigo light and dark theme
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
