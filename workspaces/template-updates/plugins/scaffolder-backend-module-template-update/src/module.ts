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
        catalog: catalogServiceRef,
        config: coreServices.rootConfig,
        scaffolderActions: scaffolderActionsExtensionPoint,
        urlReader: coreServices.urlReader,
      },
      async init({ catalog, config, scaffolderActions, urlReader }) {
        const gitlab = new GitlabClient(ScmIntegrations.fromConfig(config));
        type CatalogCredentials = NonNullable<
          Parameters<typeof catalog.getEntityByRef>[1]
        >['credentials'];
        const catalogAdapter = {
          getEntityByRef: (entityRef: string, credentials?: unknown) =>
            catalog.getEntityByRef(entityRef, {
              credentials: credentials as CatalogCredentials,
            }),
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
