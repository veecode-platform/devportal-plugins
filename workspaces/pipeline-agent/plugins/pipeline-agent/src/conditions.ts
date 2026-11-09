import { Entity } from '@backstage/catalog-model';
import {
  GITLAB_PROJECT_SLUG_ANNOTATION,
  PIPELINE_AGENT_ENABLED_ANNOTATION,
  PIPELINE_AGENT_ENABLED_VALUE,
} from '@veecode-platform/backstage-plugin-pipeline-agent-common';

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
