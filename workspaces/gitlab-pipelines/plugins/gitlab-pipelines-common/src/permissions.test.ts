import { gitlabPipelinesPermissions, gitlabPipelinePlayPermission, RESOURCE_TYPE_GITLAB_PIPELINES_ENTITY } from './permissions';

describe('permissions', () => {
  it('declares the four resource permissions from ADR-009', () => {
    expect(gitlabPipelinesPermissions.map(p => p.name).sort()).toEqual([
      'gitlab.pipeline.cancel',
      'gitlab.pipeline.play',
      'gitlab.pipeline.read',
      'gitlab.pipeline.trigger',
    ]);
    expect(gitlabPipelinePlayPermission.resourceType).toBe(RESOURCE_TYPE_GITLAB_PIPELINES_ENTITY);
    expect(gitlabPipelinePlayPermission.attributes.action).toBe('update');
  });
});
