import { KongServiceManagerClient } from './KongServiceManagerClient';
import type { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';

const BASE_URL = 'http://localhost:7007/api/kong-service-manager-backend';

function createMocks() {
  const discoveryApi: jest.Mocked<DiscoveryApi> = {
    getBaseUrl: jest.fn().mockResolvedValue(BASE_URL),
  };

  const mockFetch = jest.fn();
  const fetchApi: FetchApi = { fetch: mockFetch };

  const client = new KongServiceManagerClient({ discoveryApi, fetchApi });
  return { client, mockFetch, discoveryApi };
}

function jsonResponse(body: unknown, status = 200, statusText = 'OK') {
  return new Response(JSON.stringify(body), {
    status,
    statusText,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('KongServiceManagerClient', () => {
  // --- request() error handling ---

  it('throws on non-OK response with status text', async () => {
    const { client, mockFetch } = createMocks();
    mockFetch.mockResolvedValue(
      new Response('Not Found', { status: 404, statusText: 'Not Found' }),
    );

    await expect(
      client.getServiceInfo('default', 'my-service'),
    ).rejects.toThrow('404 Not Found');
  });

  // --- getServiceInfo ---

  it('calls correct URL for getServiceInfo', async () => {
    const { client, mockFetch } = createMocks();
    const mockData = { id: '123', name: 'my-service' };
    mockFetch.mockResolvedValue(jsonResponse(mockData));

    const result = await client.getServiceInfo('default', 'my-service');

    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE_URL}/default/services/my-service`,
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    );
    expect(result).toEqual(mockData);
  });

  // --- getAvailablePlugins ---

  it('transforms raw response into PluginPerCategory[]', async () => {
    const { client, mockFetch } = createMocks();
    mockFetch.mockResolvedValue(
      jsonResponse({
        enabled_plugins: ['basic-auth', 'key-auth', 'cors', 'rate-limiting'],
      }),
    );

    const result = await client.getAvailablePlugins('default');

    // basic-auth and key-auth → authentication category
    const authCategory = result.find(c => c.category === 'authentication');
    expect(authCategory).toBeDefined();
    expect(authCategory!.plugins).toHaveLength(2);
    expect(authCategory!.plugins.map(p => p.slug)).toEqual(
      expect.arrayContaining(['basic-auth', 'key-auth']),
    );

    // cors → security
    const secCategory = result.find(c => c.category === 'security');
    expect(secCategory).toBeDefined();
    expect(secCategory!.plugins[0].slug).toBe('cors');

    // rate-limiting → traffic-control
    const tcCategory = result.find(c => c.category === 'traffic-control');
    expect(tcCategory).toBeDefined();
    expect(tcCategory!.plugins[0].slug).toBe('rate-limiting');

    // All plugins should have associated: false
    for (const cat of result) {
      for (const p of cat.plugins) {
        expect(p.associated).toBe(false);
      }
    }
  });

  // --- removeRoute ---

  it('calls DELETE and handles 204 for removeRoute', async () => {
    const { client, mockFetch } = createMocks();
    mockFetch.mockResolvedValue(
      new Response(null, { status: 204, statusText: 'No Content' }),
    );

    await client.removeRoute('default', 'my-service', 'route-123');

    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE_URL}/default/services/my-service/routes/route-123`,
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  // --- Route plugin methods ---

  it('constructs correct URL for addPluginToRoute', async () => {
    const { client, mockFetch } = createMocks();
    const mockPlugin = { id: 'p1', name: 'cors' };
    mockFetch.mockResolvedValue(jsonResponse(mockPlugin, 201));

    await client.addPluginToRoute('default', 'route-abc', {
      name: 'cors',
      config: {},
      enabled: true,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE_URL}/default/routes/route-abc/plugins`,
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('constructs correct URL for editRoutePlugin', async () => {
    const { client, mockFetch } = createMocks();
    mockFetch.mockResolvedValue(jsonResponse({ id: 'p1', enabled: false }));

    await client.editRoutePlugin('default', 'route-abc', 'plugin-xyz', {
      enabled: false,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE_URL}/default/routes/route-abc/plugins/plugin-xyz`,
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('constructs correct URL for removeRoutePlugin', async () => {
    const { client, mockFetch } = createMocks();
    mockFetch.mockResolvedValue(
      new Response(null, { status: 204, statusText: 'No Content' }),
    );

    await client.removeRoutePlugin('default', 'route-abc', 'plugin-xyz');

    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE_URL}/default/routes/route-abc/plugins/plugin-xyz`,
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('constructs correct URL for getRouteAssociatedPlugins', async () => {
    const { client, mockFetch } = createMocks();
    mockFetch.mockResolvedValue(jsonResponse([]));

    await client.getRouteAssociatedPlugins('default', 'route-abc');

    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE_URL}/default/routes/route-abc/plugins/associated`,
      expect.anything(),
    );
  });
});
