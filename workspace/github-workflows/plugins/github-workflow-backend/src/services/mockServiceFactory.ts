import { createServiceFactory } from '@backstage/backend-plugin-api';
import { githubWorkflowsServiceRef } from './ref';
import { MockGithubWorkflowsService } from './MockGithubWorkflowsService';

/**
 * Mock service factory for development and testing.
 * Provides MockGithubWorkflowsService — no GitHub credentials needed.
 *
 * @public
 */
export const mockGithubWorkflowsServiceFactory = createServiceFactory({
  service: githubWorkflowsServiceRef,
  deps: {},
  factory() {
    return new MockGithubWorkflowsService();
  },
});
