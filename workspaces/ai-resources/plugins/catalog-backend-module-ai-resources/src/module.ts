import { createBackendModule } from '@backstage/backend-plugin-api';
import {
  CatalogModelSources,
  aiResourceEntityModel,
  mcpServerApiEntityModel,
} from '@backstage/catalog-model/alpha';
import { catalogModelExtensionPoint } from '@backstage/plugin-catalog-node/alpha';

/**
 * Registers Backstage core's AiResource entity kind (skill/rule spec types)
 * and the McpServer API model in the catalog.
 *
 * Registration-only, mirroring upstream's
 * `@backstage/plugin-catalog-backend-module-ai-model`: the schemas,
 * validators, and `ownedBy`/`partOf` relation generation are the ones the
 * host image already ships in `@backstage/catalog-model` — this module adds
 * no vocabulary of its own (ADR-007). The dependency pins (`~1.9.0`) track
 * the model version verified against the running image so the embedded copy
 * can never register schemas the host does not otherwise carry.
 *
 * @public
 */
export const catalogModuleAiResources = createBackendModule({
  pluginId: 'catalog',
  moduleId: 'ai-resources',
  register(reg) {
    reg.registerInit({
      deps: {
        model: catalogModelExtensionPoint,
      },
      async init({ model }) {
        model.addModelSource(
          CatalogModelSources.static([
            aiResourceEntityModel,
            mcpServerApiEntityModel,
          ]),
        );
      },
    });
  },
});
