import { startTestBackend } from '@backstage/backend-test-utils';
import request from 'supertest';
import dummyBackendPlugin from '@veecode-platform/backstage-plugin-dummy-backend';

describe('Backend wiring', () => {
  it('should register the dummy backend plugin and serve /teams', async () => {
    const { server } = await startTestBackend({
      features: [dummyBackendPlugin],
    });

    const res = await request(server).get('/api/plugin-dummy-backend/teams');
    expect(res.status).toBe(200);
    expect(res.body.teams).toBeDefined();
    expect(res.body.teams.length).toBeGreaterThan(0);
    expect(res.body.totalCount).toBe(25);
  });
});
