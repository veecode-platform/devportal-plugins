import {
  createServiceRef,
  createServiceFactory,
  coreServices,
} from '@backstage/backend-plugin-api';
import { GithubWorkflowsService } from './GithubWorkflowsService';

/**
 * Service reference for GithubWorkflowsService
 *
 * @public
 */
export const githubWorkflowsServiceRef = createServiceRef<GithubWorkflowsService>({
  id: 'github-workflow-backend.githubWorkflowsService',
});

/**
 * Service factory for GithubWorkflowsService
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
