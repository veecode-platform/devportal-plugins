import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { createRouter } from './router';
import { githubWorkflowsServiceRef } from './services';

/**
 * githubWorkflowBackendPlugin backend plugin
 *
 * @public
 */
export const githubWorkflowBackendPlugin = createBackendPlugin({
  pluginId: 'github-workflow-backend',
  register(env) {
    env.registerInit({
      deps: {
        httpAuth: coreServices.httpAuth,
        httpRouter: coreServices.httpRouter,
        githubWorkflowsService: githubWorkflowsServiceRef,
      },
      async init({ httpAuth, httpRouter, githubWorkflowsService }) {
        httpRouter.use(
          await createRouter({
            httpAuth,
            githubWorkflowsService,
          }),
        );
      },
    });
  },
});
