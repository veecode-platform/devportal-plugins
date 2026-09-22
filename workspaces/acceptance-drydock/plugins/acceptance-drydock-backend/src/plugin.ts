import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import Router from 'express-promise-router';

export const acceptanceDrydockBackendPlugin = createBackendPlugin({
  pluginId: 'acceptance-drydock-backend',
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
