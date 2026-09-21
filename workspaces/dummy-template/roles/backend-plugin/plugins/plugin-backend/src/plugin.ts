import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import Router from 'express-promise-router';

export const {{camelName}}BackendPlugin = createBackendPlugin({
  pluginId: '{{name}}-backend',
  register(env) {
    env.registerInit({
      deps: {
        httpRouter: coreServices.httpRouter,
      },
      async init({ httpRouter }) {
        const router = Router();
        router.get('/health', (_, response) => {
          response.json({ status: 'ok' });
        });
        httpRouter.use(router);
      },
    });
  },
});
