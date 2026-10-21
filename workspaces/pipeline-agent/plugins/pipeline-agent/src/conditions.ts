import { Entity } from '@backstage/catalog-model';
import { GITLAB_PROJECT_SLUG_ANNOTATION } from '@veecode-platform/backstage-plugin-pipeline-agent-common';

// Shows the agent card only on entities that name a GitLab project. The backend
// resolves the project from this same annotation.
export const isPipelineAgentAvailable = (entity: Entity) =>
  !!entity?.metadata.annotations?.[GITLAB_PROJECT_SLUG_ANNOTATION];
