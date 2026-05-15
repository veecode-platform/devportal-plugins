import type {
  ServiceInfoResponse,
  RoutesResponse,
  RouteResponse,
  AssociatedPluginsResponse,
  PluginFieldsResponse,
  AvailablePluginsResponse,
} from '@veecode-platform/backstage-plugin-kong-service-manager-common';

/** Realistic mock data based on Kong 3.9.1 Admin API responses */

export const mockServiceInfo: ServiceInfoResponse = {
  id: '3b06c6e5-50a7-4db2-9e44-1cf4a0c3e8d1',
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

export const mockSingleRoute: RouteResponse = {
  id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
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
  service: { id: '3b06c6e5-50a7-4db2-9e44-1cf4a0c3e8d1' },
  created_at: 1700000010,
  updated_at: 1700000011,
};

export const mockRoutesResponse: RoutesResponse = {
  data: [mockSingleRoute],
  next: null,
};

export const mockAssociatedPlugins: AssociatedPluginsResponse[] = [
  {
    id: 'p1a2b3c4-d5e6-7890-abcd-111111111111',
    name: 'rate-limiting',
    enabled: true,
    config: {
      minute: 100,
      hour: null,
      day: null,
      policy: 'local',
      fault_tolerant: true,
      hide_client_headers: false,
      redis_host: null,
    },
    protocols: ['http', 'https'],
    tags: null,
    created_at: 1700000020,
    service: { id: '3b06c6e5-50a7-4db2-9e44-1cf4a0c3e8d1' },
    route: null,
    consumer: null,
  },
  {
    id: 'p2a2b3c4-d5e6-7890-abcd-222222222222',
    name: 'cors',
    enabled: true,
    config: {
      origins: ['*'],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      headers: null,
      exposed_headers: null,
      credentials: false,
      max_age: null,
      preflight_continue: false,
    },
    protocols: ['http', 'https'],
    tags: null,
    created_at: 1700000021,
    service: { id: '3b06c6e5-50a7-4db2-9e44-1cf4a0c3e8d1' },
    route: null,
    consumer: null,
  },
];

export const mockAvailablePlugins: AvailablePluginsResponse = {
  enabled_plugins: [
    'basic-auth',
    'rate-limiting',
    'cors',
    'key-auth',
    'acl',
    'jwt',
    'request-transformer',
    'response-transformer',
  ],
};

export const mockPluginFields: PluginFieldsResponse = {
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
              required: false,
              default: 'local',
              one_of: ['local', 'cluster', 'redis'],
            },
          },
          {
            fault_tolerant: {
              type: 'boolean',
              required: false,
              default: true,
            },
          },
        ],
      },
    },
  ],
};

export const mockCreatedPlugin: AssociatedPluginsResponse = {
  id: 'p3a2b3c4-d5e6-7890-abcd-333333333333',
  name: 'rate-limiting',
  enabled: true,
  config: { minute: 50, policy: 'local' },
  protocols: ['http', 'https'],
  tags: null,
  created_at: 1700000030,
  service: { id: '3b06c6e5-50a7-4db2-9e44-1cf4a0c3e8d1' },
  route: null,
  consumer: null,
};
