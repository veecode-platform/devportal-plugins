import { createPermission } from '@backstage/plugin-permission-common';

export const RESOURCE_TYPE_GITLAB_PIPELINES_ENTITY = 'gitlab-pipelines-entity';

export const gitlabPipelineReadPermission = createPermission({
  name: 'gitlab.pipeline.read',
  attributes: { action: 'read' },
  resourceType: RESOURCE_TYPE_GITLAB_PIPELINES_ENTITY,
});
export const gitlabPipelineTriggerPermission = createPermission({
  name: 'gitlab.pipeline.trigger',
  attributes: { action: 'create' },
  resourceType: RESOURCE_TYPE_GITLAB_PIPELINES_ENTITY,
});
export const gitlabPipelinePlayPermission = createPermission({
  name: 'gitlab.pipeline.play',
  attributes: { action: 'update' },
  resourceType: RESOURCE_TYPE_GITLAB_PIPELINES_ENTITY,
});
export const gitlabPipelineCancelPermission = createPermission({
  name: 'gitlab.pipeline.cancel',
  attributes: { action: 'delete' },
  resourceType: RESOURCE_TYPE_GITLAB_PIPELINES_ENTITY,
});

export const gitlabPipelinesPermissions = [
  gitlabPipelineReadPermission,
  gitlabPipelineTriggerPermission,
  gitlabPipelinePlayPermission,
  gitlabPipelineCancelPermission,
];
