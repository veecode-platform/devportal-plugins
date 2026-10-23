export const PIPELINE_AGENT_PLUGIN_ID = 'pipeline-agent';

// Catalog annotation that names the GitLab project of an entity, as
// `group/project`. The backend resolves the project from it; the browser never
// sends one.
export const GITLAB_PROJECT_SLUG_ANNOTATION = 'gitlab.com/project-slug';

// Opt-in annotation. The backend answers an entity only when this annotation is
// "enabled"; any other value answers as if the entity did not exist.
export const PIPELINE_AGENT_ENABLED_ANNOTATION = 'veecode.io/pipeline-agent';
export const PIPELINE_AGENT_ENABLED_VALUE = 'enabled';
