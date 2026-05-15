import { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';
import type {
  KongServiceManagerApi,
  ServiceInfoResponse,
  RoutesResponse,
  RouteResponse,
  CreateRoute,
  AssociatedPluginsResponse,
  PluginFieldsResponse,
  CreatePlugin,
  PluginPerCategory,
  AvailablePluginsResponse,
  PluginCategory,
} from '@veecode-platform/backstage-plugin-kong-service-manager-common';

const PLUGIN_CATEGORY_MAP: Record<string, PluginCategory> = {
  'basic-auth': 'authentication' as PluginCategory,
  'key-auth': 'authentication' as PluginCategory,
  'oauth2': 'authentication' as PluginCategory,
  'hmac-auth': 'authentication' as PluginCategory,
  'jwt': 'authentication' as PluginCategory,
  'ldap-auth': 'authentication' as PluginCategory,
  'session': 'authentication' as PluginCategory,
  'acl': 'security' as PluginCategory,
  'cors': 'security' as PluginCategory,
  'ip-restriction': 'security' as PluginCategory,
  'bot-detection': 'security' as PluginCategory,
  'rate-limiting': 'traffic-control' as PluginCategory,
  'rate-limiting-advanced': 'traffic-control' as PluginCategory,
  'request-size-limiting': 'traffic-control' as PluginCategory,
  'request-termination': 'traffic-control' as PluginCategory,
  'response-ratelimiting': 'traffic-control' as PluginCategory,
  'proxy-cache': 'traffic-control' as PluginCategory,
  'request-transformer': 'transformation' as PluginCategory,
  'response-transformer': 'transformation' as PluginCategory,
  'correlation-id': 'transformation' as PluginCategory,
  'grpc-web': 'transformation' as PluginCategory,
  'grpc-gateway': 'transformation' as PluginCategory,
  'tcp-log': 'logging' as PluginCategory,
  'udp-log': 'logging' as PluginCategory,
  'http-log': 'logging' as PluginCategory,
  'file-log': 'logging' as PluginCategory,
  'syslog': 'logging' as PluginCategory,
  'loggly': 'logging' as PluginCategory,
  'datadog': 'analytics' as PluginCategory,
  'prometheus': 'analytics' as PluginCategory,
  'statsd': 'analytics' as PluginCategory,
  'zipkin': 'analytics' as PluginCategory,
  'opentelemetry': 'analytics' as PluginCategory,
  'aws-lambda': 'serverless' as PluginCategory,
  'azure-functions': 'serverless' as PluginCategory,
  'pre-function': 'serverless' as PluginCategory,
  'post-function': 'serverless' as PluginCategory,
  'ai-proxy': 'ai' as PluginCategory,
  'ai-prompt-template': 'ai' as PluginCategory,
  'ai-prompt-decorator': 'ai' as PluginCategory,
  'ai-prompt-guard': 'ai' as PluginCategory,
  'ai-request-transformer': 'ai' as PluginCategory,
  'ai-response-transformer': 'ai' as PluginCategory,
};

function categorizePlugin(name: string): string {
  return PLUGIN_CATEGORY_MAP[name] ?? 'other';
}

export class KongServiceManagerClient implements KongServiceManagerApi {
  private readonly discoveryApi: DiscoveryApi;
  private readonly fetchApi: FetchApi;

  constructor(options: { discoveryApi: DiscoveryApi; fetchApi: FetchApi }) {
    this.discoveryApi = options.discoveryApi;
    this.fetchApi = options.fetchApi;
  }

  private async baseUrl(): Promise<string> {
    return this.discoveryApi.getBaseUrl('kong-service-manager-backend');
  }

  private async request<T>(
    path: string,
    options?: RequestInit,
  ): Promise<T> {
    const base = await this.baseUrl();
    const url = `${base}${path}`;

    const response = await this.fetchApi.fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Kong Service Manager API request failed: ${response.status} ${response.statusText} - ${text}`,
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  async getServiceInfo(
    instance: string,
    serviceName: string,
  ): Promise<ServiceInfoResponse> {
    return this.request(
      `/${encodeURIComponent(instance)}/services/${encodeURIComponent(serviceName)}`,
    );
  }

  async getRoutesFromService(
    instance: string,
    serviceName: string,
  ): Promise<RoutesResponse> {
    return this.request(
      `/${encodeURIComponent(instance)}/services/${encodeURIComponent(serviceName)}/routes`,
    );
  }

  async getRouteById(
    instance: string,
    serviceName: string,
    routeId: string,
  ): Promise<RouteResponse> {
    return this.request(
      `/${encodeURIComponent(instance)}/services/${encodeURIComponent(serviceName)}/routes/${encodeURIComponent(routeId)}`,
    );
  }

  async createRoute(
    instance: string,
    serviceName: string,
    route: CreateRoute,
  ): Promise<RouteResponse> {
    return this.request(
      `/${encodeURIComponent(instance)}/services/${encodeURIComponent(serviceName)}/routes`,
      { method: 'POST', body: JSON.stringify(route) },
    );
  }

  async editRoute(
    instance: string,
    serviceName: string,
    routeId: string,
    route: Partial<CreateRoute>,
  ): Promise<RouteResponse> {
    return this.request(
      `/${encodeURIComponent(instance)}/services/${encodeURIComponent(serviceName)}/routes/${encodeURIComponent(routeId)}`,
      { method: 'PATCH', body: JSON.stringify(route) },
    );
  }

  async removeRoute(
    instance: string,
    serviceName: string,
    routeId: string,
  ): Promise<void> {
    await this.request(
      `/${encodeURIComponent(instance)}/services/${encodeURIComponent(serviceName)}/routes/${encodeURIComponent(routeId)}`,
      { method: 'DELETE' },
    );
  }

  async getServiceAssociatedPlugins(
    instance: string,
    serviceName: string,
  ): Promise<AssociatedPluginsResponse[]> {
    return this.request(
      `/${encodeURIComponent(instance)}/services/${encodeURIComponent(serviceName)}/plugins/associated`,
    );
  }

  async getAvailablePlugins(instance: string): Promise<PluginPerCategory[]> {
    const result = await this.request<AvailablePluginsResponse>(
      `/${encodeURIComponent(instance)}/plugins`,
    );

    const categoryMap = new Map<string, string[]>();
    for (const pluginName of result.enabled_plugins) {
      const category = categorizePlugin(pluginName);
      if (!categoryMap.has(category)) {
        categoryMap.set(category, []);
      }
      categoryMap.get(category)!.push(pluginName);
    }

    return Array.from(categoryMap.entries()).map(([category, plugins]) => ({
      category,
      plugins: plugins.map(name => ({
        name,
        slug: name,
        associated: false,
      })),
    }));
  }

  async getPluginFields(
    instance: string,
    pluginName: string,
  ): Promise<PluginFieldsResponse> {
    return this.request(
      `/${encodeURIComponent(instance)}/services/plugins/${encodeURIComponent(pluginName)}/fields`,
    );
  }

  async addPluginToService(
    instance: string,
    serviceName: string,
    plugin: CreatePlugin,
  ): Promise<AssociatedPluginsResponse> {
    return this.request(
      `/${encodeURIComponent(instance)}/services/${encodeURIComponent(serviceName)}/plugins`,
      { method: 'POST', body: JSON.stringify(plugin) },
    );
  }

  async editServicePlugin(
    instance: string,
    serviceName: string,
    pluginId: string,
    plugin: Partial<CreatePlugin>,
  ): Promise<AssociatedPluginsResponse> {
    return this.request(
      `/${encodeURIComponent(instance)}/services/${encodeURIComponent(serviceName)}/plugins/${encodeURIComponent(pluginId)}`,
      { method: 'PATCH', body: JSON.stringify(plugin) },
    );
  }

  async removeServicePlugin(
    instance: string,
    serviceName: string,
    pluginId: string,
  ): Promise<void> {
    await this.request(
      `/${encodeURIComponent(instance)}/services/${encodeURIComponent(serviceName)}/plugins/${encodeURIComponent(pluginId)}`,
      { method: 'DELETE' },
    );
  }

  async getRouteAssociatedPlugins(
    instance: string,
    routeId: string,
  ): Promise<AssociatedPluginsResponse[]> {
    return this.request(
      `/${encodeURIComponent(instance)}/routes/${encodeURIComponent(routeId)}/plugins/associated`,
    );
  }

  async addPluginToRoute(
    instance: string,
    routeId: string,
    plugin: CreatePlugin,
  ): Promise<AssociatedPluginsResponse> {
    return this.request(
      `/${encodeURIComponent(instance)}/routes/${encodeURIComponent(routeId)}/plugins`,
      { method: 'POST', body: JSON.stringify(plugin) },
    );
  }

  async editRoutePlugin(
    instance: string,
    routeId: string,
    pluginId: string,
    plugin: Partial<CreatePlugin>,
  ): Promise<AssociatedPluginsResponse> {
    return this.request(
      `/${encodeURIComponent(instance)}/routes/${encodeURIComponent(routeId)}/plugins/${encodeURIComponent(pluginId)}`,
      { method: 'PATCH', body: JSON.stringify(plugin) },
    );
  }

  async removeRoutePlugin(
    instance: string,
    routeId: string,
    pluginId: string,
  ): Promise<void> {
    await this.request(
      `/${encodeURIComponent(instance)}/routes/${encodeURIComponent(routeId)}/plugins/${encodeURIComponent(pluginId)}`,
      { method: 'DELETE' },
    );
  }
}
