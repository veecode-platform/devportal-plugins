import { startTestBackend } from '@backstage/backend-test-utils';
import request from 'supertest';
import { pipelineAgentPlugin } from './plugin';

describe('pipeline agent plugin', () => {
  it('mounts the health check under its plugin prefix without credentials', async () => {
    const { server } = await startTestBackend({
      features: [pipelineAgentPlugin],
    });

    const response = await request(server).get('/api/pipeline-agent/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
