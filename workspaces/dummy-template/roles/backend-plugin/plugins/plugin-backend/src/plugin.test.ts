import { startTestBackend } from '@backstage/backend-test-utils';
import request from 'supertest';
import { {{camelName}}BackendPlugin } from './plugin';

describe('{{name}} backend plugin', () => {
  it('serves its health endpoint', async () => {
    const { server } = await startTestBackend({
      features: [{{camelName}}BackendPlugin],
    });

    const response = await request(server).get(
      '/api/{{name}}-backend/health',
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
