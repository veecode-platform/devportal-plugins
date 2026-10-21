import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import {
  PIPELINE_AGENT_PLUGIN_ID,
  PIPELINE_AGENT_ROUTES,
} from '@veecode-platform/backstage-plugin-pipeline-agent-common';
import { createRouter } from './router';

export const pipelineAgentPlugin = createBackendPlugin({
  pluginId: PIPELINE_AGENT_PLUGIN_ID,
  register(env) {
    env.registerInit({
      deps: {
        httpRouter: coreServices.httpRouter,
      },
      async init({ httpRouter }) {
        httpRouter.use(createRouter());
        // Proof 2 probes the health route with plain curl, so it takes no credentials.
        httpRouter.addAuthPolicy({
          path: PIPELINE_AGENT_ROUTES.health,
          allow: 'unauthenticated',
        });
      },
    });
  },
});
