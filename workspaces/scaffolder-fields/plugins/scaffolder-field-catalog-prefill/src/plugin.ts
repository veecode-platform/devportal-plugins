import {
  createPlugin,
  createRoutableExtension,
} from '@backstage/core-plugin-api';

import { rootRouteRef } from './routes';

export const scaffolderFieldCatalogPrefillPlugin = createPlugin({
  id: 'scaffolder-field-catalog-prefill',
  routes: {
    root: rootRouteRef,
  },
});

export const ScaffolderFieldCatalogPrefillPage =
  scaffolderFieldCatalogPrefillPlugin.provide(
    createRoutableExtension({
      name: 'ScaffolderFieldCatalogPrefillPage',
      component: () =>
        import('./components/ExampleComponent').then(m => m.ExampleComponent),
      mountPoint: rootRouteRef,
    }),
  );
