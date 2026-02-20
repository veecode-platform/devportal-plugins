import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { createRouter } from './router';
import { KongServiceManagerService } from './services/KongServiceManagerService';

/**
 * Kong Service Manager backend plugin
 *
 * @public
 */
export const kongServiceManagerBackendPlugin = createBackendPlugin({
  pluginId: 'kong-service-manager-backend',
  register(env) {
    env.registerInit({
      deps: {
        httpAuth: coreServices.httpAuth,
        httpRouter: coreServices.httpRouter,
        config: coreServices.rootConfig,
        logger: coreServices.logger,
      },
      async init({ httpAuth, httpRouter, config, logger }) {
        logger.info('Initializing Kong Service Manager backend plugin...');

        const kongService = KongServiceManagerService.create({ logger, config });

        const router = await createRouter({ httpAuth, kongService });

        httpRouter.use(router);
        httpRouter.addAuthPolicy({
          path: '/health',
          allow: 'unauthenticated',
        });

        logger.info(
          'Kong Service Manager backend plugin initialized successfully',
        );
      },
    });
  },
});
