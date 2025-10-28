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
 * Entity tab component for GitHub Workflows with full table view and routing
 * @public
 */
export const EntityGithubWorkflowsContent = githubWorkflowsPlugin.provide(
  createRoutableExtension({
    name: 'EntityGithubWorkflowsContent',
    component: () =>
      import('./components/GithubWorkflowsTab').then(
        m => m.GithubWorkflowsTab as any,
      ),
    mountPoint: rootRouteRef,
  }),
);

/**
 * Card component for GitHub Workflows summary (overview page)
 * Shows workflow status summary with branch selector
 * @public
 */
export const EntityGithubWorkflowsCard = githubWorkflowsPlugin.provide(
  createComponentExtension({
    name: 'EntityGithubWorkflowsCard',
    component: {
      lazy: () =>
        import('./components/GithubWorkflowsCard').then(
          m => m.GithubWorkflowsCard as any,
        ),
    },
  }),
);

// Legacy exports for backward compatibility
// @deprecated Use EntityGithubWorkflowsContent instead
export const GithubWorkflowsContent = EntityGithubWorkflowsContent;

// @deprecated Use EntityGithubWorkflowsCard instead
export const GithubWorkflowsOverviewContent = EntityGithubWorkflowsCard;

// @deprecated Use EntityGithubWorkflowsContent instead
export const GithubWorkflowsTabContent = EntityGithubWorkflowsContent;
