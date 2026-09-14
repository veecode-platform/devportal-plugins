import { coreServices, createBackendPlugin } from '@backstage/backend-plugin-api';
import { catalogServiceRef } from '@backstage/plugin-catalog-node';
import { createAuthorizer } from './auth/authorize';
import { createRouter } from './router';
import { GitlabApi } from './service/GitlabApi';
import { reconcileTeardowns } from './service/lifecycleReconciler';
import { KnexTeardownStore } from './service/teardownStore';

export const gitlabPipelinesPlugin = createBackendPlugin({
  pluginId: 'gitlab-pipelines',
  register(env) {
    env.registerInit({
      deps: {
        logger: coreServices.logger,
        config: coreServices.rootConfig,
        httpRouter: coreServices.httpRouter,
        httpAuth: coreServices.httpAuth,
        userInfo: coreServices.userInfo,
        permissions: coreServices.permissions,
        catalog: catalogServiceRef,
        database: coreServices.database,
        scheduler: coreServices.scheduler,
      },
      async init({
        logger,
        config,
        httpRouter,
        httpAuth,
        userInfo,
        permissions,
        catalog,
        database,
        scheduler,
      }) {
        const authorize = createAuthorizer({
          httpAuth,
          userInfo,
          permissions,
          catalog,
        });
        const gitlab = GitlabApi.fromConfig(config);

        const lifecycleEnabled = config.getOptionalBoolean('gitlabPipelines.lifecycle.enabled') ?? false;
        const teardownJobName = config.getOptionalString('gitlabPipelines.lifecycle.teardownJobName') ?? 'destroy';
        const catalogFile = config.getOptionalString('gitlabPipelines.lifecycle.catalogFile') ?? 'catalog-info.yaml';
        const deployJobName = config.getOptionalString('gitlabPipelines.lifecycle.deployJobName') ?? 'deploy';
        const reconcileIntervalSeconds = config.getOptionalNumber('gitlabPipelines.lifecycle.reconcileIntervalSeconds') ?? 60;

        const teardownStore = lifecycleEnabled
          ? await KnexTeardownStore.create(await database.getClient())
          : undefined;

        httpRouter.use(
          createRouter({
            logger,
            authorize,
            gitlab,
            teardownStore,
            lifecycle: lifecycleEnabled ? { teardownJobName } : undefined,
          }),
        );
        // Only the permission-integration well-known path is unauthenticated; every entity route authenticates itself.
        httpRouter.addAuthPolicy({
          path: '/.well-known/backstage/permissions/metadata',
          allow: 'unauthenticated',
        });

        if (teardownStore) {
          await scheduler.scheduleTask({
            id: 'gitlab-pipelines-lifecycle-reconciler',
            frequency: { seconds: reconcileIntervalSeconds },
            timeout: { seconds: Math.max(reconcileIntervalSeconds, 30) },
            fn: () =>
              reconcileTeardowns({
                logger,
                gitlab,
                store: teardownStore,
                config: { catalogFile, deployJobName },
              }),
          });
        }
      },
    });
  },
});
