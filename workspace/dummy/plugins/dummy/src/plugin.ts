import {
  createPlugin,
  createRoutableExtension,
} from '@backstage/core-plugin-api';

import { rootRouteRef } from './routes';

export const dummyPlugin = createPlugin({
  id: 'dummy',
  routes: {
    root: rootRouteRef,
  },
});

export const DummyPage = dummyPlugin.provide(
  createRoutableExtension({
    name: 'DummyPage',
    component: () =>
      import('./components/ExampleComponent').then(m => m.ExampleComponent),
    mountPoint: rootRouteRef,
  }),
);
