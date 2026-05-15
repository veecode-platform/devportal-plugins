import { Navigate, Route } from 'react-router-dom';
import { CatalogIndexPage } from '@backstage/plugin-catalog';
import { AboutPage } from '@veecode-platform/backstage-plugin-about';
import { Root } from './components/Root';

import {
  AlertDisplay,
  OAuthRequestDialog,
  SignInPage,
} from '@backstage/core-components';
import { createApp } from '@backstage/app-defaults';
import { AppRouter, FlatRoutes } from '@backstage/core-app-api';

const app = createApp({
  components: {
    SignInPage: props => <SignInPage {...props} auto providers={['guest']} />,
  },
});

const routes = (
  <FlatRoutes>
    <Route path="/" element={<Navigate to="catalog" />} />
    <Route path="/about" element={<AboutPage />} />
    <Route path="/catalog" element={<CatalogIndexPage />} />
  </FlatRoutes>
);

export default app.createRoot(
  <>
    <AlertDisplay />
    <OAuthRequestDialog />
    <AppRouter>
      <Root>{routes}</Root>
    </AppRouter>
  </>,
);
