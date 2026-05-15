import { startTestBackend } from '@backstage/backend-test-utils';
import { createServiceFactory } from '@backstage/backend-plugin-api';
import { soccerListServiceRef } from './services/SoccerListService';
import { pluginDummyBackendPlugin } from './plugin';
import request from 'supertest';
import { NotAllowedError } from '@backstage/errors';

describe('plugin', () => {
  it('should return soccer teams with default pagination', async () => {
    const { server } = await startTestBackend({
      features: [pluginDummyBackendPlugin],
    });

    const res = await request(server).get('/api/plugin-dummy-backend/teams');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      totalCount: 25,
      limit: 10,
      offset: 0,
    });
    expect(res.body.teams).toHaveLength(10);
    expect(res.body.teams[0]).toEqual({
      id: 'arsenal',
      name: 'Arsenal',
      country: 'England',
    });
  });

  it('should support pagination query parameters', async () => {
    const { server } = await startTestBackend({
      features: [pluginDummyBackendPlugin],
    });

    const res = await request(server).get(
      '/api/plugin-dummy-backend/teams?limit=2&offset=3',
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      teams: [
        { id: 'flamengo', name: 'Flamengo', country: 'Brazil' },
        { id: 'juventus', name: 'Juventus', country: 'Italy' },
      ],
      totalCount: 25,
      limit: 2,
      offset: 3,
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
        }),
      ],
    });

    const getRes = await request(server).get('/api/plugin-dummy-backend/teams');
    expect(getRes.status).toBe(403);
    expect(getRes.body).toMatchObject({
      error: { name: 'NotAllowedError' },
    });
  });
});
