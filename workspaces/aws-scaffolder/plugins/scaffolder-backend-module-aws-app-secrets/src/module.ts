import { actionsRegistryServiceRef } from '@backstage/backend-plugin-api/alpha';
import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import { catalogServiceRef } from '@backstage/plugin-catalog-node';
import { scaffolderActionsExtensionPoint } from '@backstage/plugin-scaffolder-node';
import { registerListAppSecretsAction } from './actions/listAppSecrets';
import { createRegisterAppSecretAction } from './actions/registerAppSecret';
import { readAppSecretsConfig } from './config';

export const scaffolderModuleAwsAppSecrets = createBackendModule({
  pluginId: 'scaffolder',
  moduleId: 'aws-app-secrets',
  register(reg) {
    reg.registerInit({
      deps: {
        config: coreServices.rootConfig,
        auth: coreServices.auth,
        userInfo: coreServices.userInfo,
        urlReader: coreServices.urlReader,
        catalog: catalogServiceRef,
        scaffolderActions: scaffolderActionsExtensionPoint,
        actionsRegistry: actionsRegistryServiceRef,
      },
      async init({
        config,
        auth,
        userInfo,
        urlReader,
        catalog,
        scaffolderActions,
        actionsRegistry,
      }) {
        const deps = {
          settings: readAppSecretsConfig(config),
          auth,
          catalog,
          userInfo,
          urlReader,
          now: () => new Date(),
        };
        scaffolderActions.addActions(createRegisterAppSecretAction(deps));
        registerListAppSecretsAction(actionsRegistry, deps);
      },
    });
  },
});
