import {
  createApiFactory,
  //  createComponentExtension,
  createPlugin,
  createRoutableExtension,
  identityApiRef,
  storageApiRef,
} from '@backstage/core-plugin-api';
import {
  // type StarredEntitiesProps,
  // type VisitedByTypeProps,
  // type FeaturedDocsCardProps,
  visitsApiRef,
  VisitsStorageApi,
} from '@backstage/plugin-home';

import { rootRouteRef } from './routes';

console.log('[veecode-homepage] Initializing plugin');

export const veecodeHomepagePlugin = createPlugin({
  id: 'veecode-homepage',
  routes: {
    root: rootRouteRef,
  },
  apis: [
    createApiFactory({
      api: visitsApiRef,
      deps: {
        storageApi: storageApiRef,
        identityApi: identityApiRef,
      },
      factory: ({ storageApi, identityApi }) => {
        console.log('[veecode-homepage] Creating VisitsStorageApi');
        return VisitsStorageApi.create({ storageApi, identityApi });
      },
    }),
  ],
});

export const VeecodeHomepagePage = veecodeHomepagePlugin.provide(
  createRoutableExtension({
    name: 'c',
    component: () => {
      console.log('[veecode-homepage] Loading VeeCodeHomePage component');
      return import('./components/VeeCodeHomePage').then(m => m.VeeCodeHomePage);
    },
    mountPoint: rootRouteRef,
  }),
);
