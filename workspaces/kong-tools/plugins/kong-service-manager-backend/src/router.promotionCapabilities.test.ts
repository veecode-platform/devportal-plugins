import { mockErrorHandler, mockServices } from '@backstage/backend-test-utils';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import express from 'express';
import request from 'supertest';
import { createRouter } from './router';
import type { KongServiceManagerService } from './services/KongServiceManagerService';
import type { GitlabClient } from './services/GitlabClient';
import type { PromotionStore } from './services/promotionStore';
import type { HelmCapability, HelmCapabilityGate } from './services/helmCapability';
import type { AssociatedPluginsResponse } from '@veecode-platform/backstage-plugin-kong-service-manager-common';

const ROUTE_ID = 'route-1';
const PLUGIN_ID = 'plugin-1';
const PROMOTE_URL = `/default/services/svc/routes/${ROUTE_ID}/plugins/${PLUGIN_ID}/promote`;
const PREVIEW_URL = `${PROMOTE_URL}/preview`;
const CAPABILITIES_URL = '/default/promotion/capabilities';

const UNAVAILABLE_MESSAGE =
  'promotion unavailable: helm not found at "/opt/helm/helm" — the deployment must provide the helm CLI and point kong.promotion.helmPath at it (see README, "Prerequisites")';

const routePlugin: AssociatedPluginsResponse = {
  id: PLUGIN_ID,
  name: 'rate-limiting',
  enabled: true,
  config: { minute: 60 },
  protocols: ['http', 'https'],
  tags: null,
  created_at: 1700000000,
  service: null,
  route: { id: ROUTE_ID },
  consumer: null,
};

function kongServiceMock(): jest.Mocked<KongServiceManagerService> {
  return {
    getRouteAssociatedPlugins: jest.fn().mockResolvedValue([routePlugin]),
  } as unknown as jest.Mocked<KongServiceManagerService>;
}

function promotionStoreMock(): jest.Mocked<PromotionStore> {
  return {} as unknown as jest.Mocked<PromotionStore>;
}

function gitlabClientMock(): jest.Mocked<GitlabClient> {
  return {} as unknown as jest.Mocked<GitlabClient>;
}

/** Fixed-response gate — the real re-probing behaviour is covered by helmCapability.test.ts; this only needs to hand the router a capability. */
function fixedGate(capability: HelmCapability): HelmCapabilityGate {
  return { getCapability: jest.fn().mockResolvedValue(capability) };
}

async function buildApp(deps: { helmGate?: HelmCapabilityGate; helmPath?: string }) {
  const router = await createRouter({
    httpAuth: mockServices.httpAuth(),
    permissions: mockServices.permissions.mock({
      authorize: async () => [{ result: AuthorizeResult.ALLOW }],
    }),
    kongService: kongServiceMock(),
    userInfo: mockServices.userInfo({ userEntityRef: 'user:default/alice' }),
    promotionStore: promotionStoreMock(),
    gitlabClient: gitlabClientMock(),
    helmGate: deps.helmGate,
    helmPath: deps.helmPath,
  });
  const app = express();
  app.use(router);
  app.use(mockErrorHandler());
  return app;
}

describe('helm capability gate (ADR-018)', () => {
  describe('POST .../promote and .../promote/preview', () => {
    it('503s with the actionable message instead of a bare 500 when helm is unavailable', async () => {
      const gate = fixedGate({ available: false, path: '/opt/helm/helm', error: UNAVAILABLE_MESSAGE });
      const app = await buildApp({ helmGate: gate });

      const promote = await request(app).post(PROMOTE_URL).send({ entityRef: 'component:default/svc' });
      expect(promote.status).toBe(503);
      expect(promote.body.error.message).toBe(UNAVAILABLE_MESSAGE);

      const preview = await request(app).post(PREVIEW_URL).send({ entityRef: 'component:default/svc' });
      expect(preview.status).toBe(503);
      expect(preview.body.error.message).toBe(UNAVAILABLE_MESSAGE);
    });

    it('proceeds past the gate (never a 503) once the capability reports available', async () => {
      const gate = fixedGate({ available: true, path: 'helm', version: 'v3.15.0' });
      const app = await buildApp({ helmGate: gate });

      const res = await request(app).post(PROMOTE_URL).send({ entityRef: 'component:default/svc' });
      // No real gitlabClient/renderCheck wiring here — it fails downstream,
      // but never with the gate's 503.
      expect(res.status).not.toBe(503);
    });

    it('is never gated when no helmGate is wired (existing callers keep working)', async () => {
      const app = await buildApp({});
      const res = await request(app).post(PROMOTE_URL).send({ entityRef: 'component:default/svc' });
      expect(res.status).not.toBe(503);
    });
  });

  describe('GET .../promotion/capabilities', () => {
    it('reports the current capability from the gate', async () => {
      const gate = fixedGate({ available: true, path: '/opt/helm/helm', version: 'v3.15.0' });
      const app = await buildApp({ helmGate: gate });

      const res = await request(app).get(CAPABILITIES_URL);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ helm: { available: true, path: '/opt/helm/helm', version: 'v3.15.0' }, adapters: ['correlation-id', 'rate-limiting'] });
    });

    it('recovers on the next request after the gate re-probes successfully', async () => {
      const getCapability = jest
        .fn()
        .mockResolvedValueOnce({ available: false, path: '/opt/helm/helm', error: UNAVAILABLE_MESSAGE })
        .mockResolvedValueOnce({ available: true, path: '/opt/helm/helm', version: 'v3.15.0' });
      const app = await buildApp({ helmGate: { getCapability } });

      const first = await request(app).get(CAPABILITIES_URL);
      expect(first.body.helm.available).toBe(false);

      const second = await request(app).get(CAPABILITIES_URL);
      expect(second.body.helm.available).toBe(true);
      expect(getCapability).toHaveBeenCalledTimes(2);
    });

    it('reports unavailable with a disabled-promotion reason when no gate is wired', async () => {
      const app = await buildApp({ helmPath: 'helm' });
      const res = await request(app).get(CAPABILITIES_URL);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        helm: {
          available: false,
          path: 'helm',
          error: 'Kong plugin promotion is not enabled on this instance',
        },
        adapters: ['correlation-id', 'rate-limiting'],
      });
    });

    it('403s when permission is denied', async () => {
      const router = await createRouter({
        httpAuth: mockServices.httpAuth(),
        permissions: mockServices.permissions.mock({
          authorize: async () => [{ result: AuthorizeResult.DENY }],
        }),
        kongService: kongServiceMock(),
      });
      const app = express();
      app.use(router);
      app.use(mockErrorHandler());

      const res = await request(app).get(CAPABILITIES_URL);
      expect(res.status).toBe(403);
    });
  });
});
