import { coreServices, createBackendPlugin } from '@backstage/backend-plugin-api';
import { catalogServiceRef } from '@backstage/plugin-catalog-node';
import { createAuthorizer } from './auth/authorize';
import { createRouter } from './router';
import { GitlabApi } from './service/GitlabApi';

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
      },
      async init({
        logger,
        config,
        httpRouter,
        httpAuth,
        userInfo,
        permissions,
        catalog,
      }) {
        const authorize = createAuthorizer({
          httpAuth,
          userInfo,
          permissions,
          catalog,
        });
        httpRouter.use(
          createRouter({
            logger,
            authorize,
            gitlab: GitlabApi.fromConfig(config),
          }),
        );
        // Only the permission-integration well-known path is unauthenticated; every entity route authenticates itself.
        httpRouter.addAuthPolicy({
          path: '/.well-known/backstage/permissions/metadata',
          allow: 'unauthenticated',
        });
      },
    });
  },
});
