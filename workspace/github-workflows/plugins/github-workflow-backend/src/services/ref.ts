import {
  createServiceRef,
  createServiceFactory,
  coreServices,
} from '@backstage/backend-plugin-api';
import { GithubWorkflowsService } from './GithubWorkflowsService';
import { GithubWorkflowsServiceApi } from './types';

/**
 * Service reference for GithubWorkflowsService
 *
 * @public
 */
export const githubWorkflowsServiceRef =
  createServiceRef<GithubWorkflowsServiceApi>({
    id: 'github-workflow-backend.githubWorkflowsService',
    defaultFactory: async service =>
      createServiceFactory({
        service,
        deps: {
          config: coreServices.rootConfig,
          logger: coreServices.logger,
        },
        factory({ config, logger }) {
          return new GithubWorkflowsService(config, logger);
        },
      }),
  });
