import {
  createServiceFactory,
  type BackendFeature,
} from '@backstage/backend-plugin-api';
import { actionsRegistryServiceRef } from '@backstage/backend-plugin-api/alpha';
import { mockServices, startTestBackend } from '@backstage/backend-test-utils';
import { catalogServiceRef } from '@backstage/plugin-catalog-node';
import { catalogServiceMock } from '@backstage/plugin-catalog-node/testUtils';
import { scaffolderActionsExtensionPoint } from '@backstage/plugin-scaffolder-node';
import { REGISTER_APP_SECRET_ACTION_ID } from './actions/registerAppSecret';
import { LIST_APP_SECRETS_ACTION_NAME } from './actions/listAppSecrets';
import { exampleSettings } from './fixtures';
import { scaffolderModuleAwsAppSecrets } from './module';

describe('scaffolderModuleAwsAppSecrets', () => {
  it('registers the scaffolder action and the actions-registry action with the configured settings', async () => {
    const scaffolderActions = { addActions: jest.fn() };
    const actionsRegistry = { register: jest.fn() };
    const features: BackendFeature[] = [
      scaffolderModuleAwsAppSecrets,
      mockServices.rootConfig.factory({ data: { appSecrets: exampleSettings } }),
      createServiceFactory({
        service: actionsRegistryServiceRef,
        deps: {},
        factory: () => actionsRegistry,
      }),
      createServiceFactory({
        service: catalogServiceRef,
        deps: {},
        factory: () => catalogServiceMock(),
      }),
    ];

    await startTestBackend({
      extensionPoints: [[scaffolderActionsExtensionPoint, scaffolderActions]],
      features,
    });

    expect(scaffolderActions.addActions).toHaveBeenCalledWith(
      expect.objectContaining({ id: REGISTER_APP_SECRET_ACTION_ID }),
    );
    expect(actionsRegistry.register).toHaveBeenCalledWith(
      expect.objectContaining({ name: LIST_APP_SECRETS_ACTION_NAME }),
    );
  });
});
