import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { createRouter } from './router';
import { GithubWorkflowsService } from './services/GithubWorkflowsService';

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
        config: coreServices.rootConfig,
        logger: coreServices.logger,
      },
      async init({ httpAuth, httpRouter, config, logger }) {
        logger.info('Initializing GitHub Workflows backend plugin...');
        
        // Create the service instance directly
        const githubWorkflowsService = new GithubWorkflowsService(config, logger);
        logger.info('GitHub Workflows service created');
        
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
