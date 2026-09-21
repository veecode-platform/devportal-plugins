import {
  createPlugin,
  createRoutableExtension,
} from '@backstage/core-plugin-api';

import { rootRouteRef } from './routes';

export const {{camelName}}Plugin = createPlugin({
  id: '{{name}}',
  routes: {
    root: rootRouteRef,
  },
});

export const {{pascalName}}Page = {{camelName}}Plugin.provide(
  createRoutableExtension({
    name: '{{pascalName}}Page',
    component: () =>
      import('./components/{{pascalName}}Page').then(
        m => m.{{pascalName}}Page,
      ),
    mountPoint: rootRouteRef,
  }),
);
