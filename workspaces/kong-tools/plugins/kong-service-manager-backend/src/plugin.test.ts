import {
  startTestBackend,
  mockServices,
} from '@backstage/backend-test-utils';
import request from 'supertest';
import { kongServiceManagerBackendPlugin } from './plugin';

describe('kongServiceManagerBackendPlugin', () => {
  it('responds to health check through the full stack', async () => {
    const { server } = await startTestBackend({
      features: [
        kongServiceManagerBackendPlugin,
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
        mockServices.rootConfig.factory({ data: {} }),
      ],
    });

    const res = await request(server).get(
      '/api/kong-service-manager-backend/health',
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
