import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { catalogServiceRef } from '@backstage/plugin-catalog-node';
import { createRouter } from './router';
import { KongServiceManagerService } from './services/KongServiceManagerService';
import { KnexPromotionStore } from './services/promotionStore';
import { GitlabClient } from './services/GitlabClient';
import { reconcilePromotions } from './services/promotionFinalizer';
import { createHelmCapabilityGate, probeHelm } from './services/helmCapability';

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
      async init({ httpAuth, httpRouter, config, logger, permissions, database, scheduler, userInfo, catalog }) {
        logger.info('Initializing Kong Service Manager backend plugin...');

        const kongService = KongServiceManagerService.create({ logger, config });

        const promotionEnabled = config.getOptionalBoolean('kong.promotion.enabled') ?? false;
        // Store and GitLab client are created together, eagerly, so a later
        // promote request never pays for a first-use migration and the
        // router never has to special-case "store present, client absent";
        // the finalizer (below) consumes the same pair.
        const promotionStore = promotionEnabled
          ? await KnexPromotionStore.create(await database.getClient())
          : undefined;
        const gitlabClient = promotionEnabled
          ? GitlabClient.fromConfig(config, catalog)
          : undefined;

        // Helm is a declared deployment prerequisite for promote/preview
        // (ADR-018) — the portal image doesn't bundle it, so it's probed
        // once at startup here and re-probed lazily by the gate while
        // unavailable, rather than surfacing as a raw 500 mid-request.
        const helmPath = config.getOptionalString('kong.promotion.helmPath') ?? 'helm';
        const helmTimeoutSeconds = config.getOptionalNumber('kong.promotion.helmTimeoutSeconds') ?? 60;
        let helmGate: ReturnType<typeof createHelmCapabilityGate> | undefined;
        if (promotionEnabled) {
          const initialHelmCapability = await probeHelm(helmPath, helmTimeoutSeconds);
          if (!initialHelmCapability.available) {
            logger.warn(
              `Kong plugin promotion: helm CLI unavailable at "${helmPath}" — promote and preview will return 503 until the deployment provides it. See the kong-service-manager-backend README, "Prerequisites". (${initialHelmCapability.error})`,
            );
          }
          helmGate = createHelmCapabilityGate({
            helmPath,
            timeoutSeconds: helmTimeoutSeconds,
            initial: initialHelmCapability,
          });
        }

        const router = await createRouter({
          httpAuth,
          permissions,
          kongService,
          userInfo,
          promotionStore,
          gitlabClient,
          helmGate,
          helmPath,
          helmTimeoutSeconds,
        });

        httpRouter.use(router);
        httpRouter.addAuthPolicy({
          path: '/health',
          allow: 'unauthenticated',
        });

        if (promotionStore && gitlabClient) {
          const applyTimeoutMinutes = config.getOptionalNumber('kong.promotion.applyTimeoutMinutes') ?? 10;
          const reconcileIntervalSeconds = config.getOptionalNumber('kong.promotion.reconcileIntervalSeconds') ?? 60;
          await scheduler.scheduleTask({
            id: 'kong-service-manager-promotion-finalizer',
            frequency: { seconds: reconcileIntervalSeconds },
            timeout: { seconds: Math.max(reconcileIntervalSeconds, 30) },
            fn: () =>
              reconcilePromotions({
                logger,
                gitlab: gitlabClient,
                kong: kongService,
                store: promotionStore,
                config: { applyTimeoutMinutes },
              }),
          });
        }

        logger.info(
          'Kong Service Manager backend plugin initialized successfully',
        );
      },
    });
  },
});
