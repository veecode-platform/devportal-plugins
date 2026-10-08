import { AlertDisplay, OAuthRequestDialog } from '@backstage/core-components';
import { createApp } from '@backstage/app-defaults';
import { AppRouter, FlatRoutes } from '@backstage/core-app-api';
import { Route } from 'react-router-dom';
import { ScaffolderFieldCatalogPrefillPage } from '@veecode-platform/backstage-plugin-scaffolder-field-catalog-prefill';

const app = createApp();

const routes = (
  <FlatRoutes>
    <Route
      path="/scaffolder-field-catalog-prefill"
      element={<ScaffolderFieldCatalogPrefillPage />}
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
