import { createComponentExtension, createPlugin } from '@backstage/core-plugin-api';
import { PIPELINE_AGENT_PLUGIN_ID } from '@veecode-platform/backstage-plugin-pipeline-agent-common';

export const pipelineAgentPlugin = createPlugin({
  id: PIPELINE_AGENT_PLUGIN_ID,
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
