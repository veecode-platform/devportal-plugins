import {
  createServiceFactory,
  coreServices,
} from '@backstage/backend-plugin-api';
import { GithubWorkflowsService } from './GithubWorkflowsService';
import { githubWorkflowsServiceRef } from './ref';

export { githubWorkflowsServiceRef } from './ref';

/**
 * Service factory for GithubWorkflowsService.
 *
 * Useful when the hosting app needs to register the real service explicitly
 * (e.g. alongside other overrides).
 *
 * @public
 */
export const githubWorkflowsServiceFactory = createServiceFactory({
  service: githubWorkflowsServiceRef,
  deps: {
    config: coreServices.rootConfig,
    logger: coreServices.logger,
  },
  factory({ config, logger }) {
    return new GithubWorkflowsService(config, logger);
  },
});

export type { GithubWorkflowsServiceApi } from './types';
export { MockGithubWorkflowsService } from './MockGithubWorkflowsService';
export { mockGithubWorkflowsServiceFactory } from './mockServiceFactory';
