import {
  createApiFactory,
  createComponentExtension,
  createPlugin,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/core-plugin-api';
import { PIPELINE_AGENT_PLUGIN_ID } from '@veecode-platform/backstage-plugin-pipeline-agent-common';
import { PipelineAgentClient, pipelineAgentApiRef } from './api';

export const pipelineAgentPlugin = createPlugin({
  id: PIPELINE_AGENT_PLUGIN_ID,
  apis: [
    createApiFactory({
      api: pipelineAgentApiRef,
      deps: { discoveryApi: discoveryApiRef, fetchApi: fetchApiRef },
      factory: ({ discoveryApi, fetchApi }) =>
        new PipelineAgentClient({ discoveryApi, fetchApi }),
    }),
  ],
});

export const PipelineAgentCard = pipelineAgentPlugin.provide(
  createComponentExtension({
    name: 'PipelineAgentCard',
    component: {
      lazy: () =>
        import('./components/PipelineAgentCard').then(m => m.PipelineAgentCard),
    },
  }),
);
