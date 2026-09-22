import { startTestBackend } from '@backstage/backend-test-utils';
import request from 'supertest';
import { acceptanceDrydockBackendPlugin } from './plugin';

describe('acceptance-drydock backend plugin', () => {
  it('serves its health endpoint', async () => {
    const { server } = await startTestBackend({
      features: [acceptanceDrydockBackendPlugin],
    });

    const response = await request(server).get(
      '/api/acceptance-drydock-backend/health',
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
