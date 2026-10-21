import { Entity } from '@backstage/catalog-model';
import { GITLAB_PROJECT_SLUG_ANNOTATION } from '@veecode-platform/backstage-plugin-pipeline-agent-common';

// Mirrors PIPELINE_AGENT_ENABLED_ANNOTATION in pipeline-agent-common. The two
// copies must stay equal until the frontend imports the common constant.
export const PIPELINE_AGENT_ENABLED_ANNOTATION = 'veecode.io/pipeline-agent';
export const PIPELINE_AGENT_ENABLED_VALUE = 'enabled';

// Shows the agent card only on entities that opt in with the enabled annotation
// and name a GitLab project. The slug alone is not enough: many entities carry it.
export const isPipelineAgentAvailable = (entity: Entity) => {
  const annotations = entity?.metadata.annotations;
  return (
    annotations?.[PIPELINE_AGENT_ENABLED_ANNOTATION] ===
      PIPELINE_AGENT_ENABLED_VALUE &&
    !!annotations?.[GITLAB_PROJECT_SLUG_ANNOTATION]
  );
};
