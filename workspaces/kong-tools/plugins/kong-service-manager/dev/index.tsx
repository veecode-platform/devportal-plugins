import { createDevApp } from '@backstage/dev-utils';
import { createApiFactory } from '@backstage/core-plugin-api';
import { EntityProvider } from '@backstage/plugin-catalog-react';
import { Entity } from '@backstage/catalog-model';
import type {
  KongServiceManagerApi,
  ServiceInfoResponse,
  RoutesResponse,
  RouteResponse,
  AssociatedPluginsResponse,
  PluginFieldsResponse,
  PluginPerCategory,
} from '@veecode-platform/backstage-plugin-kong-service-manager-common';
import {
  kongServiceManagerPlugin,
  KongServiceManagerContent,
  kongServiceManagerApiRef,
} from '../src';

// ---------------------------------------------------------------------------
// Mock data (based on Kong 3.9.1 Admin API shapes)
// ---------------------------------------------------------------------------

const SERVICE_ID = '3b06c6e5-50a7-4db2-9e44-1cf4a0c3e8d1';
const ROUTE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const PLUGIN_ID = 'p1a2b3c4-d5e6-7890-abcd-111111111111';

const mockServiceInfo: ServiceInfoResponse = {
  id: SERVICE_ID,
  name: 'my-service',
  protocol: 'http',
  host: 'httpbin.org',
  port: 80,
  path: '/anything',
  retries: 5,
  connect_timeout: 60000,
  write_timeout: 60000,
  read_timeout: 60000,
  enabled: true,
  created_at: 1700000000,
  updated_at: 1700000001,
  tags: ['managed'],
};

const mockRoute: RouteResponse = {
  id: ROUTE_ID,
  name: 'my-route',
  protocols: ['http', 'https'],
  methods: ['GET', 'POST'],
  hosts: ['example.com'],
  paths: ['/api/v1'],
  headers: null,
  https_redirect_status_code: 426,
  regex_priority: 0,
  strip_path: true,
  path_handling: 'v0',
  preserve_host: false,
  request_buffering: true,
  response_buffering: true,
  tags: null,
  service: { id: SERVICE_ID },
  created_at: 1700000010,
  updated_at: 1700000011,
};

const mockPlugin: AssociatedPluginsResponse = {
  id: PLUGIN_ID,
  name: 'rate-limiting',
  enabled: true,
  config: { minute: 100, policy: 'local', fault_tolerant: true },
  protocols: ['http', 'https'],
  tags: null,
  created_at: 1700000020,
  service: { id: SERVICE_ID },
  route: null,
  consumer: null,
};

const mockPluginFields: PluginFieldsResponse = {
  fields: [
    {
      config: {
        type: 'record',
        fields: [
          { minute: { type: 'number', required: false } },
          { hour: { type: 'number', required: false } },
          { day: { type: 'number', required: false } },
          {
            policy: {
              type: 'string',
              default: 'local',
              one_of: ['local', 'cluster', 'redis'],
            },
          },
        ],
      },
    },
  ],
};

const mockAvailablePlugins: PluginPerCategory[] = [
  {
    category: 'traffic-control',
    plugins: [
      { name: 'rate-limiting', slug: 'rate-limiting', associated: true },
      { name: 'request-size-limiting', slug: 'request-size-limiting', associated: false },
    ],
  },
  {
    category: 'security',
    plugins: [
      { name: 'cors', slug: 'cors', associated: false },
      { name: 'acl', slug: 'acl', associated: false },
    ],
  },
  {
    category: 'authentication',
    plugins: [
      { name: 'basic-auth', slug: 'basic-auth', associated: false },
      { name: 'key-auth', slug: 'key-auth', associated: false },
    ],
  },
];

// ---------------------------------------------------------------------------
// Mock API implementation
// ---------------------------------------------------------------------------

const mockApi: KongServiceManagerApi = {
  getServiceInfo: async () => mockServiceInfo,
  getRoutesFromService: async (): Promise<RoutesResponse> => ({
    data: [mockRoute],
    next: null,
  }),
  getRouteById: async () => mockRoute,
  createRoute: async () => mockRoute,
  editRoute: async () => mockRoute,
  removeRoute: async () => {},
  getServiceAssociatedPlugins: async () => [mockPlugin],
  getAvailablePlugins: async () => mockAvailablePlugins,
  getPluginFields: async () => mockPluginFields,
  addPluginToService: async () => mockPlugin,
  editServicePlugin: async () => mockPlugin,
  removeServicePlugin: async () => {},
  getRouteAssociatedPlugins: async () => [mockPlugin],
  addPluginToRoute: async () => mockPlugin,
  editRoutePlugin: async () => mockPlugin,
  removeRoutePlugin: async () => {},
};

// ---------------------------------------------------------------------------
// Dev app
// ---------------------------------------------------------------------------

const mockEntity: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: 'my-service',
    annotations: {
      'kong-manager/service-name': 'my-service',
      'kong-manager/instance': 'default',
    },
  },
  spec: {
    type: 'service',
    lifecycle: 'production',
    owner: 'team-platform',
  },
};

createDevApp()
  .registerPlugin(kongServiceManagerPlugin)
  .addPage({
    element: (
      <EntityProvider entity={mockEntity}>
        <KongServiceManagerContent />
      </EntityProvider>
    ),
    title: 'Kong Service Manager',
    path: '/kong-service-manager',
  })
  .registerApi(
    createApiFactory({
      api: kongServiceManagerApiRef,
      deps: {},
      factory: () => mockApi,
    }),
  )
  .render();
