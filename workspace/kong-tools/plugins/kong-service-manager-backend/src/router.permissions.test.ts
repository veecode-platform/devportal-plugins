import { mockErrorHandler, mockServices } from '@backstage/backend-test-utils';
import {
  AuthorizeResult,
  type DefinitivePolicyDecision,
  type AuthorizePermissionRequest,
} from '@backstage/plugin-permission-common';
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

// ---------------------------------------------------------------------------
// Role-based authorize helpers
// ---------------------------------------------------------------------------

const READ_PERMISSIONS = new Set([
  'kong.service.read',
  'kong.plugins.read',
  'kong.routes.read',
]);

const PLUGIN_MUTATION_PERMISSIONS = new Set([
  'kong.plugin.service.apply',
  'kong.plugin.service.update',
  'kong.plugin.service.disable',
  'kong.plugin.route.apply',
  'kong.plugin.route.update',
  'kong.plugin.route.disable',
]);

type Role = 'admin' | 'operator' | 'viewer';

const ALLOW: DefinitivePolicyDecision = { result: AuthorizeResult.ALLOW };
const DENY: DefinitivePolicyDecision = { result: AuthorizeResult.DENY };

function policyFor(role: Role) {
  return async (
    requests: AuthorizePermissionRequest[],
  ): Promise<DefinitivePolicyDecision[]> => {
    return requests.map(r => {
      const name = r.permission.name;

      if (READ_PERMISSIONS.has(name)) return ALLOW;
      if (role === 'admin') return ALLOW;
      if (role === 'operator' && PLUGIN_MUTATION_PERMISSIONS.has(name)) {
        return ALLOW;
      }
      return DENY;
    });
  };
}

// ---------------------------------------------------------------------------
// Build app for a given role
// ---------------------------------------------------------------------------

function createKongServiceMock(): jest.Mocked<KongServiceManagerService> {
  return {
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
}

async function buildApp(role: Role) {
  const kongService = createKongServiceMock();

  // Stub all service methods with realistic mock data
  kongService.getServiceInfo.mockResolvedValue(mockServiceInfo);
  kongService.getRoutes.mockResolvedValue(mockRoutesResponse);
  kongService.getRouteById.mockResolvedValue(mockSingleRoute);
  kongService.createRoute.mockResolvedValue(mockSingleRoute);
  kongService.editRoute.mockResolvedValue(mockSingleRoute);
  kongService.removeRoute.mockResolvedValue(undefined);
  kongService.getServiceAssociatedPlugins.mockResolvedValue(mockAssociatedPlugins);
  kongService.getAvailablePlugins.mockResolvedValue(mockAvailablePlugins);
  kongService.getPluginFields.mockResolvedValue(mockPluginFields);
  kongService.addPluginToService.mockResolvedValue(mockCreatedPlugin);
  kongService.editServicePlugin.mockResolvedValue(mockCreatedPlugin);
  kongService.removeServicePlugin.mockResolvedValue(undefined);
  kongService.getRouteAssociatedPlugins.mockResolvedValue(mockAssociatedPlugins);
  kongService.addPluginToRoute.mockResolvedValue(mockCreatedPlugin);
  kongService.editRoutePlugin.mockResolvedValue(mockCreatedPlugin);
  kongService.removeRoutePlugin.mockResolvedValue(undefined);

  const router = await createRouter({
    httpAuth: mockServices.httpAuth(),
    permissions: mockServices.permissions.mock({
      authorize: policyFor(role),
    }),
    kongService,
  });

  const app = express();
  app.use(router);
  app.use(mockErrorHandler());
  return app;
}

// ---------------------------------------------------------------------------
// Endpoint definitions for the test matrix
// ---------------------------------------------------------------------------

const ROUTE_ID = mockSingleRoute.id;
const PLUGIN_ID = mockCreatedPlugin.id;

interface Endpoint {
  label: string;
  method: 'get' | 'post' | 'patch' | 'delete';
  path: string;
  body?: Record<string, unknown>;
  category: 'read' | 'plugin-mutation' | 'route-mutation';
  expectedSuccess: number;
}

const endpoints: Endpoint[] = [
  // --- Read endpoints ---
  {
    label: 'GET service info',
    method: 'get',
    path: '/default/services/my-service',
    category: 'read',
    expectedSuccess: 200,
  },
  {
    label: 'GET service associated plugins',
    method: 'get',
    path: '/default/services/my-service/plugins/associated',
    category: 'read',
    expectedSuccess: 200,
  },
  {
    label: 'GET available plugins',
    method: 'get',
    path: '/default/plugins',
    category: 'read',
    expectedSuccess: 200,
  },
  {
    label: 'GET plugin fields',
    method: 'get',
    path: '/default/services/plugins/rate-limiting/fields',
    category: 'read',
    expectedSuccess: 200,
  },
  {
    label: 'GET routes',
    method: 'get',
    path: '/default/services/my-service/routes',
    category: 'read',
    expectedSuccess: 200,
  },
  {
    label: 'GET single route',
    method: 'get',
    path: `/default/services/my-service/routes/${ROUTE_ID}`,
    category: 'read',
    expectedSuccess: 200,
  },
  {
    label: 'GET route associated plugins',
    method: 'get',
    path: `/default/routes/${ROUTE_ID}/plugins/associated`,
    category: 'read',
    expectedSuccess: 200,
  },

  // --- Plugin mutation endpoints (service) ---
  {
    label: 'POST add service plugin',
    method: 'post',
    path: '/default/services/my-service/plugins',
    body: { name: 'rate-limiting', config: { minute: 50 } },
    category: 'plugin-mutation',
    expectedSuccess: 201,
  },
  {
    label: 'PATCH edit service plugin',
    method: 'patch',
    path: `/default/services/my-service/plugins/${PLUGIN_ID}`,
    body: { config: { minute: 200 } },
    category: 'plugin-mutation',
    expectedSuccess: 200,
  },
  {
    label: 'DELETE remove service plugin',
    method: 'delete',
    path: `/default/services/my-service/plugins/${PLUGIN_ID}`,
    category: 'plugin-mutation',
    expectedSuccess: 204,
  },

  // --- Plugin mutation endpoints (route) ---
  {
    label: 'POST add route plugin',
    method: 'post',
    path: `/default/routes/${ROUTE_ID}/plugins`,
    body: { name: 'rate-limiting', config: { minute: 50 } },
    category: 'plugin-mutation',
    expectedSuccess: 201,
  },
  {
    label: 'PATCH edit route plugin',
    method: 'patch',
    path: `/default/routes/${ROUTE_ID}/plugins/${PLUGIN_ID}`,
    body: { enabled: false },
    category: 'plugin-mutation',
    expectedSuccess: 200,
  },
  {
    label: 'DELETE remove route plugin',
    method: 'delete',
    path: `/default/routes/${ROUTE_ID}/plugins/${PLUGIN_ID}`,
    category: 'plugin-mutation',
    expectedSuccess: 204,
  },

  // --- Route mutation endpoints ---
  {
    label: 'POST create route',
    method: 'post',
    path: '/default/services/my-service/routes',
    body: { name: 'my-route', paths: ['/api/v1'] },
    category: 'route-mutation',
    expectedSuccess: 201,
  },
  {
    label: 'PATCH edit route',
    method: 'patch',
    path: `/default/services/my-service/routes/${ROUTE_ID}`,
    body: { paths: ['/api/v2'] },
    category: 'route-mutation',
    expectedSuccess: 200,
  },
  {
    label: 'DELETE remove route',
    method: 'delete',
    path: `/default/services/my-service/routes/${ROUTE_ID}`,
    category: 'route-mutation',
    expectedSuccess: 204,
  },
];

// ---------------------------------------------------------------------------
// Expected status per role × category
// ---------------------------------------------------------------------------

function expectedStatus(role: Role, ep: Endpoint): number {
  if (ep.category === 'read') return ep.expectedSuccess;
  if (role === 'admin') return ep.expectedSuccess;
  if (role === 'operator' && ep.category === 'plugin-mutation') {
    return ep.expectedSuccess;
  }
  return 403;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Router permission matrix', () => {
  const roles: Role[] = ['admin', 'operator', 'viewer'];

  for (const role of roles) {
    describe(`Role: ${role}`, () => {
      let app: express.Express;

      beforeAll(async () => {
        app = await buildApp(role);
      });

      for (const ep of endpoints) {
        const expected = expectedStatus(role, ep);

        it(`${ep.method.toUpperCase()} ${ep.label} → ${expected}`, async () => {
          const req = request(app)[ep.method](ep.path);
          if (ep.body) req.send(ep.body);
          const res = await req;
          expect(res.status).toBe(expected);
        });
      }
    });
  }
});
