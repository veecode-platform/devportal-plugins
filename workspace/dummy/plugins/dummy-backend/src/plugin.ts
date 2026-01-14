import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { createRouter } from './router';
import { soccerListServiceRef } from './services/SoccerListService';

/**
 * pluginDummyBackendPlugin backend plugin
 *
 * @public
 */
export const pluginDummyBackendPlugin = createBackendPlugin({
  pluginId: 'plugin-dummy-backend',
  register(env) {
    env.registerInit({
      deps: {
        httpRouter: coreServices.httpRouter,
        soccerList: soccerListServiceRef,
      },
      async init({ httpRouter, soccerList }) {
        httpRouter.use(
          await createRouter({
            soccerList,
          }),
        );
      },
    });
  },
});
