import {
  createApiFactory,
  createPlugin,
  createRoutableExtension,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/core-plugin-api';
import { kongServiceManagerApiRef, KongServiceManagerClient } from './api';
import { rootRouteRef } from './routes';

export const kongServiceManagerPlugin = createPlugin({
  id: 'kong-service-manager',
  routes: {
    root: rootRouteRef,
  },
  apis: [
    createApiFactory({
      api: kongServiceManagerApiRef,
      deps: {
        discoveryApi: discoveryApiRef,
        fetchApi: fetchApiRef,
      },
      factory: ({ discoveryApi, fetchApi }) =>
        new KongServiceManagerClient({ discoveryApi, fetchApi }),
    }),
  ],
});

export const KongServiceManagerContent = kongServiceManagerPlugin.provide(
  createRoutableExtension({
    name: 'KongServiceManagerContent',
    component: () =>
      import('./components/KongServiceManagerHomepage/KongServiceManagerRoot').then(
        m => m.KongServiceManagerRoot,
      ),
    mountPoint: rootRouteRef,
  }),
);
