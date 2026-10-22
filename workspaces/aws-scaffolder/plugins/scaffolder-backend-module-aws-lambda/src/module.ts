import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import { scaffolderActionsExtensionPoint } from '@backstage/plugin-scaffolder-node';
import { createLambdaInvokeAction } from './actions/lambdaInvoke';
import { readLambdaTargets } from './config';

export const scaffolderModuleAwsLambda = createBackendModule({
  pluginId: 'scaffolder',
  moduleId: 'aws-lambda',
  register(reg) {
    reg.registerInit({
      deps: {
        config: coreServices.rootConfig,
        scaffolderActions: scaffolderActionsExtensionPoint,
      },
      async init({ config, scaffolderActions }) {
        scaffolderActions.addActions(
          createLambdaInvokeAction({ targets: readLambdaTargets(config) }),
        );
      },
    });
  },
});
