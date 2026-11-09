import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import { actionsRegistryServiceRef } from '@backstage/backend-plugin-api/alpha';
import { ScmIntegrations } from '@backstage/integration';
import { catalogServiceRef } from '@backstage/plugin-catalog-node';
import { registerAppPublicationActions } from './actions/appPublication';
import { readAppPublicationConfig } from './config';
import { systemClock } from './dependencies';

export const scaffolderModuleAppPublication = createBackendModule({
  pluginId: 'scaffolder',
  moduleId: 'app-publication',
  register(reg) {
    reg.registerInit({
      deps: {
        config: coreServices.rootConfig,
        auth: coreServices.auth,
        userInfo: coreServices.userInfo,
        catalog: catalogServiceRef,
        actionsRegistry: actionsRegistryServiceRef,
      },
      async init({ config, auth, userInfo, catalog, actionsRegistry }) {
        registerAppPublicationActions(actionsRegistry, {
          auth,
          catalog,
          userInfo,
          settings: readAppPublicationConfig(config),
          gitlabIntegrations: ScmIntegrations.fromConfig(config).gitlab,
          fetch: globalThis.fetch,
          clock: systemClock,
          appBaseUrl: config.getOptionalString('app.baseUrl'),
        });
      },
    });
  },
});
