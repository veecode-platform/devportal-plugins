import { AlertDisplay, OAuthRequestDialog } from '@backstage/core-components';
import { createApp } from '@backstage/app-defaults';
import { AppRouter, FlatRoutes } from '@backstage/core-app-api';
import {
  ScaffolderFieldExtensions,
  ScaffolderPage,
} from '@backstage/plugin-scaffolder';
import { Navigate, Route } from 'react-router-dom';
import {
  CatalogEntityPrefillExtension,
  catalogEntityPrefillTranslations,
} from '@veecode-platform/backstage-plugin-scaffolder-field-catalog-prefill';
import { apis } from './apis';

const app = createApp({
  apis,
  __experimentalTranslations: {
    availableLanguages: ['en', 'pt-BR'],
    resources: [catalogEntityPrefillTranslations],
  },
});

const routes = (
  <FlatRoutes>
    <Route path="/" element={<Navigate to="/create" />} />
    <Route path="/create" element={<ScaffolderPage />}>
      <ScaffolderFieldExtensions>
        <CatalogEntityPrefillExtension />
      </ScaffolderFieldExtensions>
    </Route>
  </FlatRoutes>
);

export default app.createRoot(
  <>
    <AlertDisplay />
    <OAuthRequestDialog />
    <AppRouter>{routes}</AppRouter>
  </>,
);
