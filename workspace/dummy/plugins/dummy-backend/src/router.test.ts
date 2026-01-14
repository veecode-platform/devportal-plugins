import { mockErrorHandler } from '@backstage/backend-test-utils';
import express from 'express';
import request from 'supertest';

import { createRouter } from './router';
import { soccerListServiceRef } from './services/SoccerListService';

const mockTeams = {
  teams: [
    { id: 'arsenal', name: 'Arsenal', country: 'England' },
    { id: 'flamengo', name: 'Flamengo', country: 'Brazil' },
  ],
};

// TEMPLATE NOTE:
// Testing the router directly allows you to write a unit test that mocks the provided options.
describe('createRouter', () => {
  let app: express.Express;
  let soccerList: jest.Mocked<typeof soccerListServiceRef.T>;

  beforeEach(async () => {
    soccerList = { listTeams: jest.fn() };
    const router = await createRouter({
      soccerList,
    });
    app = express();
    app.use(router);
    app.use(mockErrorHandler());
  });

  it('should return soccer teams', async () => {
    soccerList.listTeams.mockResolvedValue(mockTeams);

    const response = await request(app).get('/teams');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(mockTeams);
  });
});
