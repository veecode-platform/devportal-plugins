import { AlertDisplay, OAuthRequestDialog } from '@backstage/core-components';
import { createApp } from '@backstage/app-defaults';
import { AppRouter, FlatRoutes } from '@backstage/core-app-api';
import { Route } from 'react-router-dom';
import { {{pascalName}}Page } from '@veecode-platform/backstage-plugin-{{name}}';

const app = createApp();

const routes = (
  <FlatRoutes>
    <Route
      path="/{{name}}"
      element={<{{pascalName}}Page />}
    />
  </FlatRoutes>
);

export default app.createRoot(
  <>
    <AlertDisplay />
    <OAuthRequestDialog />
    <AppRouter>{routes}</AppRouter>
  </>,
);
