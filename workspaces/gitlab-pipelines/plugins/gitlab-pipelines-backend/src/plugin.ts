import { coreServices, createBackendPlugin } from '@backstage/backend-plugin-api';

export const gitlabPipelinesPlugin = createBackendPlugin({
  pluginId: 'gitlab-pipelines',
  register(env) {
    env.registerInit({
      deps: { logger: coreServices.logger },
      async init({ logger }) {
        logger.info('gitlab-pipelines backend: scaffold');
      },
    });
  },
});
