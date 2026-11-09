import {
  pipelineAgentInvestigationApprovePermission,
  pipelineAgentInvestigationCreatePermission,
  pipelineAgentPermissions,
  RESOURCE_TYPE_CATALOG_ENTITY,
} from './permissions';

describe('pipeline agent permissions', () => {
  it('declares the create and approve permissions on catalog entities', () => {
    expect(pipelineAgentPermissions.map(p => p.name).sort()).toEqual([
      'pipeline-agent.investigation.approve',
      'pipeline-agent.investigation.create',
    ]);
    expect(pipelineAgentInvestigationCreatePermission.resourceType).toBe(
      RESOURCE_TYPE_CATALOG_ENTITY,
    );
    expect(pipelineAgentInvestigationApprovePermission.resourceType).toBe(
      'catalog-entity',
    );
  });

  it('maps create and approve to distinct actions', () => {
    expect(pipelineAgentInvestigationCreatePermission.attributes.action).toBe(
      'create',
    );
    expect(pipelineAgentInvestigationApprovePermission.attributes.action).toBe(
      'update',
    );
  });
});
