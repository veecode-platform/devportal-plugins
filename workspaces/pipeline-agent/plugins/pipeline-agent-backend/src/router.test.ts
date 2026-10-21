import express from 'express';
import request from 'supertest';
import { createRouter } from './router';

function appWithRouter() {
  const app = express();
  app.use(createRouter());
  return app;
}

describe('pipeline agent router', () => {
  it('answers the health check with ok', async () => {
    const response = await request(appWithRouter()).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it.each([
    ['POST', '/investigations'],
    ['GET', '/investigations/inv-1/events'],
    ['POST', '/investigations/inv-1/aprovar'],
    ['POST', '/investigations/inv-1/recusar'],
    ['POST', '/investigations/inv-1/orientar'],
    ['GET', '/project'],
    ['GET', '/history'],
  ])('answers %s %s with 501 until the handler exists', async (method, path) => {
    const app = appWithRouter();
    const response =
      method === 'GET' ? await request(app).get(path) : await request(app).post(path);

    expect(response.status).toBe(501);
    expect(response.body).toEqual({ erro: 'not implemented yet' });
  });
});
