import {
  createServiceFactory,
  type BackendFeature,
} from '@backstage/backend-plugin-api';
import { actionsRegistryServiceRef } from '@backstage/backend-plugin-api/alpha';
import { mockServices, startTestBackend } from '@backstage/backend-test-utils';
import { catalogServiceRef } from '@backstage/plugin-catalog-node';
import { catalogServiceMock } from '@backstage/plugin-catalog-node/testUtils';
import { scaffolderModuleAppPublication } from './module';

describe('scaffolderModuleAppPublication', () => {
  it('registers both actions in the actions registry, read-only and idempotent', async () => {
    const actionsRegistry = { register: jest.fn() };
    const features: BackendFeature[] = [
      scaffolderModuleAppPublication,
      mockServices.rootConfig.factory({
        data: {
          integrations: {
            gitlab: [
              {
                host: 'gitlab.example.com',
                apiBaseUrl: 'https://gitlab.example.com/api/v4',
                token: 'example-token',
              },
            ],
          },
        },
      }),
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

    await startTestBackend({ features });

    const names = actionsRegistry.register.mock.calls.map(call => call[0].name);
    expect(names).toEqual(['get-app-status', 'wait-for-app-publication']);
    for (const call of actionsRegistry.register.mock.calls) {
      expect(call[0].attributes).toEqual({ readOnly: true, idempotent: true });
    }
  });
});
