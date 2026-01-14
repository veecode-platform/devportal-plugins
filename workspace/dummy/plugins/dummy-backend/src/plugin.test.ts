import { startTestBackend } from '@backstage/backend-test-utils';
import { createServiceFactory } from '@backstage/backend-plugin-api';
import { soccerListServiceRef } from './services/SoccerListService';
import { pluginDummyBackendPlugin } from './plugin';
import request from 'supertest';
import { NotAllowedError } from '@backstage/errors';

// TEMPLATE NOTE:
// Plugin tests are integration tests for your plugin, ensuring that all pieces
// work together end-to-end. You can still mock injected backend services
// however, just like anyone who installs your plugin might replace the
// services with their own implementations.
describe('plugin', () => {
  it('should return soccer teams', async () => {
    const { server } = await startTestBackend({
      features: [pluginDummyBackendPlugin],
    });

    const res = await request(server).get('/api/plugin-dummy-backend/teams');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      teams: [
        { id: 'arsenal', name: 'Arsenal', country: 'England' },
        { id: 'barcelona', name: 'FC Barcelona', country: 'Spain' },
        { id: 'bayern', name: 'FC Bayern München', country: 'Germany' },
        { id: 'flamengo', name: 'Flamengo', country: 'Brazil' },
        { id: 'juventus', name: 'Juventus', country: 'Italy' },
      ],
    });
  });

  it('should forward errors from the SoccerListService', async () => {
    const { server } = await startTestBackend({
      features: [
        pluginDummyBackendPlugin,
        createServiceFactory({
          service: soccerListServiceRef,
          deps: {},
          factory: () => ({
            listTeams: jest.fn().mockRejectedValue(new NotAllowedError()),
          }),
        })
      ],
    });

    const getRes = await request(server).get('/api/plugin-dummy-backend/teams');
    expect(getRes.status).toBe(403);
    expect(getRes.body).toMatchObject({
      error: { name: 'NotAllowedError' },
    });
  });
});
