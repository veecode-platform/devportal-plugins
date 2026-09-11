import { mockServices } from '@backstage/backend-test-utils';
import { ConfigReader } from '@backstage/config';
import { NotFoundError } from '@backstage/errors';
import { KongServiceManagerService } from './KongServiceManagerService';
import {
  mockServiceInfo,
  mockRoutesResponse,
  mockAssociatedPlugins,
} from '../mocks';

function createConfig(overrides?: Record<string, unknown>) {
  return new ConfigReader({
    kong: {
      instances: [
        {
          id: 'default',
          apiBaseUrl: 'http://kong:8001',
          auth: { kongAdmin: 'my-token' },
          ...overrides,
        },
      ],
    },
  });
}

function createService(config = createConfig()) {
  return KongServiceManagerService.create({
    logger: mockServices.logger.mock(),
    config,
  });
}

describe('KongServiceManagerService', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  // --- getInstance ---

  it('throws NotFoundError for unknown instance', async () => {
    const svc = createService();
    await expect(
      svc.getServiceInfo('nonexistent', 'my-service'),
    ).rejects.toThrow(NotFoundError);
  });

  // --- getServiceInfo ---

  it('builds correct URL for getServiceInfo', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(mockServiceInfo), { status: 200 }),
    );
    const svc = createService();

    const result = await svc.getServiceInfo('default', 'my-service');

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://kong:8001/services/my-service',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Kong-Admin-Token': 'my-token',
        }),
      }),
    );
    expect(result).toEqual(mockServiceInfo);
  });

  // --- workspace prefix ---

  it('includes workspace in URL when configured', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(mockServiceInfo), { status: 200 }),
    );
    const svc = createService(createConfig({ workspace: 'prod' }));

    await svc.getServiceInfo('default', 'my-service');

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://kong:8001/prod/services/my-service',
      expect.anything(),
    );
  });

  // --- getRoutes ---

  it('builds correct URL for getRoutes', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(mockRoutesResponse), { status: 200 }),
    );
    const svc = createService();

    const result = await svc.getRoutes('default', 'my-service');

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://kong:8001/services/my-service/routes',
      expect.anything(),
    );
    expect(result).toEqual(mockRoutesResponse);
  });

  // --- kongFetch error path ---

  it('throws on non-OK response', async () => {
    fetchSpy.mockResolvedValue(
      new Response('Bad Gateway', { status: 502, statusText: 'Bad Gateway' }),
    );
    const svc = createService();

    await expect(
      svc.getServiceInfo('default', 'my-service'),
    ).rejects.toThrow('Kong API request failed: 502 Bad Gateway');
  });

  // --- kongFetch 204 ---

  it('returns undefined on 204 response', async () => {
    fetchSpy.mockResolvedValue(
      new Response(null, { status: 204, statusText: 'No Content' }),
    );
    const svc = createService();

    // removeRoute calls kongFetch with DELETE, expects void/undefined
    const result = await svc.removeRoute('default', 'my-service', 'route-id');
    expect(result).toBeUndefined();
  });

  // --- custom auth header ---

  it('uses custom auth header when configured', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ data: mockAssociatedPlugins }), {
        status: 200,
      }),
    );
    const config = new ConfigReader({
      kong: {
        instances: [
          {
            id: 'custom-auth',
            apiBaseUrl: 'http://kong:8001',
            auth: {
              custom: { header: 'X-Api-Key', value: 'secret-key' },
            },
          },
        ],
      },
    });
    const svc = createService(config);

    await svc.getServiceAssociatedPlugins('custom-auth', 'my-service');

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Api-Key': 'secret-key',
        }),
      }),
    );
    // Should NOT have Kong-Admin-Token
    const headers = fetchSpy.mock.calls[0][1].headers;
    expect(headers).not.toHaveProperty('Kong-Admin-Token');
  });

  // --- Kong-Admin-Token header ---

  it('sets Kong-Admin-Token when kongAdmin auth is configured', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(mockServiceInfo), { status: 200 }),
    );
    const svc = createService();

    await svc.getServiceInfo('default', 'my-service');

    const headers = fetchSpy.mock.calls[0][1].headers;
    expect(headers['Kong-Admin-Token']).toBe('my-token');
    expect(headers['Content-Type']).toBe('application/json');
  });

  // --- getInstances ---

  it('getInstances returns ids and URLs without auth credentials', () => {
    const config = new ConfigReader({
      kong: {
        instances: [
          {
            id: 'default',
            apiBaseUrl: 'http://kong:8001',
            auth: { kongAdmin: 'my-token' },
          },
          {
            id: 'staging',
            apiBaseUrl: 'http://kong-staging:8001',
            workspace: 'dev',
            auth: {
              custom: { header: 'X-Api-Key', value: 'secret' },
            },
          },
        ],
      },
    });
    const svc = createService(config);

    const instances = svc.getInstances();

    expect(instances).toEqual([
      { id: 'default', apiBaseUrl: 'http://kong:8001', workspace: undefined },
      { id: 'staging', apiBaseUrl: 'http://kong-staging:8001', workspace: 'dev' },
    ]);
    // Verify no auth data leaked
    for (const inst of instances) {
      expect(inst).not.toHaveProperty('auth');
    }
  });

  it('getInstances returns empty array when no instances configured', () => {
    const config = new ConfigReader({});
    const svc = createService(config);
    expect(svc.getInstances()).toEqual([]);
  });

  // --- defaultTags ---

  describe('defaultTags', () => {
    const bodyOfCall = (call = 0) =>
      JSON.parse(fetchSpy.mock.calls[call][1].body);

    it('injects defaultTags on create when the caller sends no tags', async () => {
      const svc = createService(
        createConfig({ defaultTags: ['devportal-managed'] }),
      );

      await svc.createRoute('default', 'my-service', {
        name: 'r1',
        paths: ['/r1'],
      } as any);

      expect(bodyOfCall().tags).toEqual(['devportal-managed']);
    });

    it('merges and dedupes caller tags with defaultTags on create', async () => {
      const svc = createService(
        createConfig({ defaultTags: ['devportal-managed'] }),
      );

      await svc.addPluginToService('default', 'my-service', {
        name: 'rate-limiting',
        tags: ['team-x', 'devportal-managed'],
      } as any);

      expect(bodyOfCall().tags).toEqual(['devportal-managed', 'team-x']);
    });

    it('does not touch tags on PATCH when the caller sends none', async () => {
      const svc = createService(
        createConfig({ defaultTags: ['devportal-managed'] }),
      );

      await svc.editRoute('default', 'my-service', 'route-id', {
        paths: ['/new'],
      });

      expect(bodyOfCall()).not.toHaveProperty('tags');
    });

    it('merges defaultTags back in on PATCH when the caller sends tags', async () => {
      const svc = createService(
        createConfig({ defaultTags: ['devportal-managed'] }),
      );

      await svc.editRoutePlugin('default', 'route-id', 'plugin-id', {
        tags: ['team-x'],
      } as any);

      expect(bodyOfCall().tags).toEqual(['devportal-managed', 'team-x']);
    });

    it('sends no tags key at all when defaultTags is not configured', async () => {
      const svc = createService();

      await svc.createRoute('default', 'my-service', {
        name: 'r1',
        paths: ['/r1'],
      } as any);

      expect(bodyOfCall()).not.toHaveProperty('tags');
    });
  });

  // --- no instances configured ---

  it('initializes with empty instances when none configured', () => {
    const config = new ConfigReader({});
    const svc = createService(config);

    expect(() =>
      // Any call should fail with NotFoundError since no instances
      svc.getServiceInfo('default', 'my-service'),
    ).rejects.toThrow(NotFoundError);
  });
});
