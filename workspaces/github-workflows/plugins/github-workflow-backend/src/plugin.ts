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
        logger: coreServices.logger,
        githubWorkflowsService: githubWorkflowsServiceRef,
      },
      async init({ httpAuth, httpRouter, logger, githubWorkflowsService }) {
        logger.info('Initializing GitHub Workflows backend plugin...');

        const router = await createRouter({
          httpAuth,
          githubWorkflowsService,
        });

        logger.info('GitHub Workflows router created, registering routes...');
        httpRouter.use(router);
        logger.info('GitHub Workflows backend plugin initialized successfully');
      },
    });
  },
});
