import { createBackendModule, coreServices } from "@backstage/backend-plugin-api";
import { scaffolderActionsExtensionPoint } from '@backstage/plugin-scaffolder-node';
import { createDeckGenerateAction } from "./actions/deckGenerate";
import { createDeckSyncAction } from "./actions/deckSync";
import { createDeckPingAction } from "./actions/deckPing";

/**
 * A backend module that registers the action into the scaffolder
 */
export const scaffolderModule = createBackendModule({
  moduleId: 'kong-actions',
  pluginId: 'scaffolder',
  register({ registerInit }) {
    registerInit({
      deps: {
        scaffolderActions: scaffolderActionsExtensionPoint,
        config: coreServices.rootConfig,
      },
      async init({ scaffolderActions, config }) {
        scaffolderActions.addActions(
          createDeckGenerateAction({ config }),
          createDeckSyncAction(),
          createDeckPingAction()
        );
      }
    });
  },
})
