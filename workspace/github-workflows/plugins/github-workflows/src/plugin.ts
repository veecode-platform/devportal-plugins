import {
  createApiFactory,
  createComponentExtension,
  createPlugin,
  createRoutableExtension,
  discoveryApiRef,
} from '@backstage/core-plugin-api';
import { buildRouteRef, rootRouteRef } from './routes';
import { githubWorkflowsApiRef, GithubWorkflowsClient } from './api';

/**
 *  @public
 */

export const githubWorkflowsPlugin = createPlugin({
  id: 'githubWorkflows',
  apis: [
    createApiFactory({
      api: githubWorkflowsApiRef,
      deps: { discoveryApi: discoveryApiRef },
      factory: ({ discoveryApi }) => {
        return new GithubWorkflowsClient({ discoveryApi });
      },
    }),
  ],
  routes: {
    root: rootRouteRef,
    buildRoute: buildRouteRef,
  },
});

/**
 *  @public
 */

export const GithubWorkflowsContent = githubWorkflowsPlugin.provide(
  createRoutableExtension({
    name: 'GithubWorkflowsContent',
    component: () =>
      import('./components/GitubWorkflowsContent').then(
        m => m.GithubWorkflowsContent as any,
      ),
    mountPoint: rootRouteRef,
  }),
);

/**
 *  Dynamic export - Component extension for cards
 *  @public
 */

export const GithubWorkflowsOverviewContent = githubWorkflowsPlugin.provide(
  createComponentExtension({
    name: 'GithubWorkflowsOverviewContent',
    component: {
      lazy: () =>
        import('./components/GitubWorkflowsContent').then(
          m => m.GithubWorkflowsOverviewContent as any,
        ),
    },
  }),
);

/**
 *  Dynamic export
 *  @public
 */

export const GithubWorkflowsTabContent = githubWorkflowsPlugin.provide(
  createRoutableExtension({
    name: 'GithubWorkflowsTabContent',
    component: () =>
      import('./components/GitubWorkflowsContent').then(
        m => m.GithubWorkflowsTabContent as any,
      ),
    mountPoint: rootRouteRef,
  }),
);
