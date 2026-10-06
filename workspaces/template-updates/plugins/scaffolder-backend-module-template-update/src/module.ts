import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import { ScmIntegrations } from '@backstage/integration';
import { catalogServiceRef } from '@backstage/plugin-catalog-node';
import { scaffolderActionsExtensionPoint } from '@backstage/plugin-scaffolder-node';
import { createMergeAction } from './actions/mergeAction';
import { createPublishMrAction } from './actions/publishMrAction';
import { createReadRecordAction } from './actions/readRecordAction';
import { GitlabClient } from './gitlab/GitlabClient';

export const scaffolderTemplateUpdateModule = createBackendModule({
  pluginId: 'scaffolder',
  moduleId: 'template-update',
  register(env) {
    env.registerInit({
      deps: {
        auth: coreServices.auth,
        catalog: catalogServiceRef,
        config: coreServices.rootConfig,
        scaffolderActions: scaffolderActionsExtensionPoint,
        urlReader: coreServices.urlReader,
      },
      async init({ auth, catalog, config, scaffolderActions, urlReader }) {
        const credentials = await auth.getOwnServiceCredentials();
        const gitlab = new GitlabClient(ScmIntegrations.fromConfig(config));
        const catalogAdapter = {
          getEntityByRef: (entityRef: string) =>
            catalog.getEntityByRef(entityRef, { credentials }),
        };

        scaffolderActions.addActions(
          createReadRecordAction({
            catalog: catalogAdapter,
            urlReader,
            gitlab,
          }),
          createMergeAction(),
          createPublishMrAction({ gitlab }),
        );
      },
    });
  },
});
