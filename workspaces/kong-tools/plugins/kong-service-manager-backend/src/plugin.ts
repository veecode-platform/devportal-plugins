import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { createRouter } from './router';
import { KongServiceManagerService } from './services/KongServiceManagerService';
import { KnexPromotionStore } from './services/promotionStore';

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
        permissions: coreServices.permissions,
        database: coreServices.database,
        scheduler: coreServices.scheduler,
      },
      async init({ httpAuth, httpRouter, config, logger, permissions, database }) {
        logger.info('Initializing Kong Service Manager backend plugin...');

        const kongService = KongServiceManagerService.create({ logger, config });

        const promotionEnabled = config.getOptionalBoolean('kong.promotion.enabled') ?? false;
        if (promotionEnabled) {
          // Store is created (and migrated) eagerly so a later promote
          // request never pays for a first-use migration; the finalizer
          // that consumes it lands in a later task.
          await KnexPromotionStore.create(await database.getClient());
        }

        const router = await createRouter({ httpAuth, permissions, kongService });

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
