import {
  startTestBackend,
  mockServices,
  TestDatabases,
} from '@backstage/backend-test-utils';
import { catalogServiceMock } from '@backstage/plugin-catalog-node/testUtils';
import request from 'supertest';
import { kongServiceManagerBackendPlugin } from './plugin';

describe('kongServiceManagerBackendPlugin', () => {
  const databases = TestDatabases.create({ ids: ['SQLITE_3'] });

  it('responds to health check through the full stack', async () => {
    const { server } = await startTestBackend({
      features: [
        kongServiceManagerBackendPlugin,
        catalogServiceMock.factory({ entities: [] }),
        mockServices.rootConfig.factory({
          data: {
            kong: {
              instances: [
                {
                  id: 'default',
                  apiBaseUrl: 'http://localhost:8001',
                  auth: { kongAdmin: 'test-token' },
                },
              ],
            },
          },
        }),
      ],
    });

    const res = await request(server).get(
      '/api/kong-service-manager-backend/health',
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('starts without kong config and health still responds', async () => {
    const { server } = await startTestBackend({
      features: [
        kongServiceManagerBackendPlugin,
        catalogServiceMock.factory({ entities: [] }),
        mockServices.rootConfig.factory({ data: {} }),
      ],
    });

    const res = await request(server).get(
      '/api/kong-service-manager-backend/health',
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('migrates the promotion store and still boots when kong.promotion is enabled', async () => {
    const knex = await databases.init('SQLITE_3');

    const { server } = await startTestBackend({
      features: [
        kongServiceManagerBackendPlugin,
        catalogServiceMock.factory({ entities: [] }),
        mockServices.rootConfig.factory({
          data: {
            kong: { promotion: { enabled: true } },
            integrations: {
              gitlab: [
                { host: 'gitlab.example.com', token: 'glpat-test', apiBaseUrl: 'https://gitlab.example.com/api/v4' },
              ],
            },
          },
        }),
        mockServices.database.factory({ knex }),
      ],
    });

    const res = await request(server).get(
      '/api/kong-service-manager-backend/health',
    );
    expect(res.status).toBe(200);

    const hasPromotionsTable = await knex.schema.hasTable('promotions');
    expect(hasPromotionsTable).toBe(true);
  });
});
