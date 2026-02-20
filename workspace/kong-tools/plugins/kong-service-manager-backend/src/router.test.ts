import { mockErrorHandler } from '@backstage/backend-test-utils';
import { mockServices } from '@backstage/backend-test-utils';
import express from 'express';
import request from 'supertest';

import { createRouter } from './router';
import type { KongServiceManagerService } from './services/KongServiceManagerService';
import {
  mockServiceInfo,
  mockAssociatedPlugins,
  mockAvailablePlugins,
  mockPluginFields,
  mockCreatedPlugin,
  mockRoutesResponse,
  mockSingleRoute,
} from './mocks';

describe('createRouter', () => {
  let app: express.Express;
  let kongService: jest.Mocked<KongServiceManagerService>;

  beforeEach(async () => {
    kongService = {
      getServiceInfo: jest.fn(),
      getRoutes: jest.fn(),
      getRouteById: jest.fn(),
      createRoute: jest.fn(),
      editRoute: jest.fn(),
      removeRoute: jest.fn(),
      getServiceAssociatedPlugins: jest.fn(),
      getAvailablePlugins: jest.fn(),
      getPluginFields: jest.fn(),
      addPluginToService: jest.fn(),
      editServicePlugin: jest.fn(),
      removeServicePlugin: jest.fn(),
      getRouteAssociatedPlugins: jest.fn(),
      addPluginToRoute: jest.fn(),
      editRoutePlugin: jest.fn(),
      removeRoutePlugin: jest.fn(),
    } as unknown as jest.Mocked<KongServiceManagerService>;

    const router = await createRouter({
      httpAuth: mockServices.httpAuth(),
      kongService,
    });
    app = express();
    app.use(router);
    app.use(mockErrorHandler());
  });

  // --- Health ---

  it('GET /health returns 200', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  // --- Service info ---

  it('GET /:instance/services/:serviceName returns service info', async () => {
    kongService.getServiceInfo.mockResolvedValue(mockServiceInfo);

    const res = await request(app).get('/default/services/my-service');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(mockServiceInfo);
    expect(kongService.getServiceInfo).toHaveBeenCalledWith(
      'default',
      'my-service',
    );
  });

  it('GET /:instance/services/:serviceName forwards service errors', async () => {
    kongService.getServiceInfo.mockRejectedValue(new Error('Kong unreachable'));

    const res = await request(app).get('/default/services/my-service');
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      error: { message: 'Kong unreachable' },
    });
  });

  // --- Associated plugins (service) ---

  it('GET /:instance/services/:serviceName/plugins/associated returns plugins', async () => {
    kongService.getServiceAssociatedPlugins.mockResolvedValue(
      mockAssociatedPlugins,
    );

    const res = await request(app).get(
      '/default/services/my-service/plugins/associated',
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual(mockAssociatedPlugins);
  });

  // --- Available plugins ---

  it('GET /:instance/plugins returns available plugins', async () => {
    kongService.getAvailablePlugins.mockResolvedValue(mockAvailablePlugins);

    const res = await request(app).get('/default/plugins');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(mockAvailablePlugins);
  });

  // --- Plugin fields ---

  it('GET /:instance/services/plugins/:pluginName/fields returns schema', async () => {
    kongService.getPluginFields.mockResolvedValue(mockPluginFields);

    const res = await request(app).get(
      '/default/services/plugins/rate-limiting/fields',
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual(mockPluginFields);
  });

  // --- Add service plugin ---

  it('POST /:instance/services/:serviceName/plugins creates plugin → 201', async () => {
    kongService.addPluginToService.mockResolvedValue(mockCreatedPlugin);

    const res = await request(app)
      .post('/default/services/my-service/plugins')
      .send({ name: 'rate-limiting', config: { minute: 50 } });
    expect(res.status).toBe(201);
    expect(res.body).toEqual(mockCreatedPlugin);
  });

  it('POST /:instance/services/:serviceName/plugins with missing name → 400', async () => {
    const res = await request(app)
      .post('/default/services/my-service/plugins')
      .send({ config: { minute: 50 } });
    expect(res.status).toBe(400);
  });

  // --- Edit service plugin ---

  it('PATCH /:instance/services/:serviceName/plugins/:pluginId updates plugin', async () => {
    kongService.editServicePlugin.mockResolvedValue({
      ...mockCreatedPlugin,
      config: { minute: 200, policy: 'local' },
    });

    const res = await request(app)
      .patch(
        `/default/services/my-service/plugins/${mockCreatedPlugin.id}`,
      )
      .send({ config: { minute: 200 } });
    expect(res.status).toBe(200);
    expect(kongService.editServicePlugin).toHaveBeenCalledWith(
      'default',
      'my-service',
      mockCreatedPlugin.id,
      { config: { minute: 200 } },
    );
  });

  // --- Remove service plugin ---

  it('DELETE /:instance/services/:serviceName/plugins/:pluginId → 204', async () => {
    kongService.removeServicePlugin.mockResolvedValue(undefined);

    const res = await request(app).delete(
      `/default/services/my-service/plugins/${mockCreatedPlugin.id}`,
    );
    expect(res.status).toBe(204);
  });

  // --- List routes ---

  it('GET /:instance/services/:serviceName/routes returns routes', async () => {
    kongService.getRoutes.mockResolvedValue(mockRoutesResponse);

    const res = await request(app).get('/default/services/my-service/routes');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(mockRoutesResponse);
  });

  // --- Get route ---

  it('GET /:instance/services/:serviceName/routes/:routeId returns route', async () => {
    kongService.getRouteById.mockResolvedValue(mockSingleRoute);

    const res = await request(app).get(
      `/default/services/my-service/routes/${mockSingleRoute.id}`,
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual(mockSingleRoute);
  });

  // --- Create route ---

  it('POST /:instance/services/:serviceName/routes creates route → 201', async () => {
    kongService.createRoute.mockResolvedValue(mockSingleRoute);

    const res = await request(app)
      .post('/default/services/my-service/routes')
      .send({ name: 'my-route', paths: ['/api/v1'] });
    expect(res.status).toBe(201);
    expect(res.body).toEqual(mockSingleRoute);
  });

  // --- Edit route ---

  it('PATCH /:instance/services/:serviceName/routes/:routeId updates route', async () => {
    const updated = { ...mockSingleRoute, paths: ['/api/v2'] };
    kongService.editRoute.mockResolvedValue(updated);

    const res = await request(app)
      .patch(`/default/services/my-service/routes/${mockSingleRoute.id}`)
      .send({ paths: ['/api/v2'] });
    expect(res.status).toBe(200);
    expect(res.body.paths).toEqual(['/api/v2']);
  });

  // --- Delete route ---

  it('DELETE /:instance/services/:serviceName/routes/:routeId → 204', async () => {
    kongService.removeRoute.mockResolvedValue(undefined);

    const res = await request(app).delete(
      `/default/services/my-service/routes/${mockSingleRoute.id}`,
    );
    expect(res.status).toBe(204);
  });

  // --- Route associated plugins ---

  it('GET /:instance/routes/:routeId/plugins/associated returns plugins', async () => {
    kongService.getRouteAssociatedPlugins.mockResolvedValue(
      mockAssociatedPlugins,
    );

    const res = await request(app).get(
      `/default/routes/${mockSingleRoute.id}/plugins/associated`,
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual(mockAssociatedPlugins);
  });

  // --- Add route plugin ---

  it('POST /:instance/routes/:routeId/plugins creates plugin → 201', async () => {
    kongService.addPluginToRoute.mockResolvedValue(mockCreatedPlugin);

    const res = await request(app)
      .post(`/default/routes/${mockSingleRoute.id}/plugins`)
      .send({ name: 'rate-limiting', config: { minute: 50 } });
    expect(res.status).toBe(201);
    expect(res.body).toEqual(mockCreatedPlugin);
  });

  // --- Edit route plugin ---

  it('PATCH /:instance/routes/:routeId/plugins/:pluginId updates plugin', async () => {
    kongService.editRoutePlugin.mockResolvedValue({
      ...mockCreatedPlugin,
      enabled: false,
    });

    const res = await request(app)
      .patch(
        `/default/routes/${mockSingleRoute.id}/plugins/${mockCreatedPlugin.id}`,
      )
      .send({ enabled: false });
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(false);
  });

  // --- Remove route plugin ---

  it('DELETE /:instance/routes/:routeId/plugins/:pluginId → 204', async () => {
    kongService.removeRoutePlugin.mockResolvedValue(undefined);

    const res = await request(app).delete(
      `/default/routes/${mockSingleRoute.id}/plugins/${mockCreatedPlugin.id}`,
    );
    expect(res.status).toBe(204);
  });

  // --- Error propagation ---

  it('propagates unexpected service errors as 500', async () => {
    kongService.getAvailablePlugins.mockRejectedValue(
      new Error('connection refused'),
    );

    const res = await request(app).get('/default/plugins');
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      error: { message: 'connection refused' },
    });
  });
});
