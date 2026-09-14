import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { catalogServiceRef } from '@backstage/plugin-catalog-node';
import { createRouter } from './router';
import { KongServiceManagerService } from './services/KongServiceManagerService';
import { KnexPromotionStore } from './services/promotionStore';
import { GitlabClient } from './services/GitlabClient';

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
        userInfo: coreServices.userInfo,
        catalog: catalogServiceRef,
      },
      async init({ httpAuth, httpRouter, config, logger, permissions, database, userInfo, catalog }) {
        logger.info('Initializing Kong Service Manager backend plugin...');

        const kongService = KongServiceManagerService.create({ logger, config });

        const promotionEnabled = config.getOptionalBoolean('kong.promotion.enabled') ?? false;
        // Store and GitLab client are created together, eagerly, so a later
        // promote request never pays for a first-use migration and the
        // router never has to special-case "store present, client absent";
        // the finalizer that also consumes the store lands in a later task.
        const promotionStore = promotionEnabled
          ? await KnexPromotionStore.create(await database.getClient())
          : undefined;
        const gitlabClient = promotionEnabled
          ? GitlabClient.fromConfig(config, catalog)
          : undefined;

        const router = await createRouter({
          httpAuth,
          permissions,
          kongService,
          userInfo,
          promotionStore,
          gitlabClient,
        });

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
