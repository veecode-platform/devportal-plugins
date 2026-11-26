import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import { actionsRegistryServiceRef } from '@backstage/backend-plugin-api/alpha';
import { ScmIntegrations } from '@backstage/integration';
import { catalogServiceRef } from '@backstage/plugin-catalog-node';
import { scaffolderActionsExtensionPoint } from '@backstage/plugin-scaffolder-node';
import { registerAppPublicationActions } from './actions/appPublication';
import { createMergeRequestAutoMergeAction } from './actions/mergeRequestAutoMerge';
import { readAppPublicationConfig } from './config';
import { systemClock } from './dependencies';

/**
 * Registers the two actions when `appPublication` is valid. When it is missing
 * or invalid, the module logs the reason and registers nothing, so the rest of
 * the scaffolder keeps working. The auto-merge template action needs only the
 * GitLab integrations, so it is added whatever the block says.
 */
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
        scaffolderActions: scaffolderActionsExtensionPoint,
        logger: coreServices.logger,
      },
      async init({
        config,
        auth,
        userInfo,
        catalog,
        actionsRegistry,
        scaffolderActions,
        logger,
      }) {
        const gitlabIntegrations = ScmIntegrations.fromConfig(config).gitlab;
        scaffolderActions.addActions(
          createMergeRequestAutoMergeAction({
            auth,
            gitlabIntegrations,
            fetch: globalThis.fetch,
            clock: systemClock,
          }),
        );

        let settings;
        try {
          settings = readAppPublicationConfig(config);
        } catch (error) {
          logger.error(
            `The app-publication actions are not registered: ${
              error instanceof Error ? error.message : 'invalid configuration'
            }. Fix the appPublication block of the app configuration; the other scaffolder actions are unaffected.`,
          );
          return;
        }
        registerAppPublicationActions(actionsRegistry, {
          auth,
          catalog,
          userInfo,
          settings,
          gitlabIntegrations,
          fetch: globalThis.fetch,
          clock: systemClock,
          appBaseUrl: config.getOptionalString('app.baseUrl'),
        });
      },
    });
  },
});
