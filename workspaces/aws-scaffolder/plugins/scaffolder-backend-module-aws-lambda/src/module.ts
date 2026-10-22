import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';

export const scaffolderModuleAwsLambda = createBackendModule({
  pluginId: 'scaffolder',
  moduleId: 'aws-lambda',
  register(reg) {
    reg.registerInit({
      deps: { logger: coreServices.logger },
      async init({ logger }) {
        logger.info('Hello World!');
      },
    });
  },
});
