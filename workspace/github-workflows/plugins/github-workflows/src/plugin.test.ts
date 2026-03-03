import {
  githubWorkflowsPlugin,
  EntityGithubWorkflowsContent,
  EntityGithubWorkflowsCard,
} from './plugin';

describe('github-workflows plugin', () => {
  it('exports the plugin', () => {
    expect(githubWorkflowsPlugin).toBeDefined();
    expect(githubWorkflowsPlugin.getId()).toBe('githubWorkflows');
  });

  it('exports EntityGithubWorkflowsContent extension', () => {
    expect(EntityGithubWorkflowsContent).toBeDefined();
  });

  it('exports EntityGithubWorkflowsCard extension', () => {
    expect(EntityGithubWorkflowsCard).toBeDefined();
  });
});
