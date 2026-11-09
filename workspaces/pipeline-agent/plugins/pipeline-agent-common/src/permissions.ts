import { createPermission } from '@backstage/plugin-permission-common';

export const RESOURCE_TYPE_CATALOG_ENTITY = 'catalog-entity';

export const pipelineAgentInvestigationCreatePermission = createPermission({
  name: 'pipeline-agent.investigation.create',
  attributes: { action: 'create' },
  resourceType: RESOURCE_TYPE_CATALOG_ENTITY,
});

export const pipelineAgentInvestigationApprovePermission = createPermission({
  name: 'pipeline-agent.investigation.approve',
  attributes: { action: 'update' },
  resourceType: RESOURCE_TYPE_CATALOG_ENTITY,
});

export const pipelineAgentPermissions = [
  pipelineAgentInvestigationCreatePermission,
  pipelineAgentInvestigationApprovePermission,
];
