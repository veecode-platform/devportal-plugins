import {
  coreServices,
  createServiceFactory,
  createServiceRef,
  LoggerService,
} from '@backstage/backend-plugin-api';
import { Config } from '@backstage/config';
import { NotFoundError } from '@backstage/errors';
import type {
  ServiceInfoResponse,
  RoutesResponse,
  RouteResponse,
  CreateRoute,
  AssociatedPluginsResponse,
  PluginFieldsResponse,
  CreatePlugin,
  AvailablePluginsResponse,
} from '@veecode-platform/backstage-plugin-kong-service-manager-common';

/** Configuration for a single Kong instance */
export type KongInstanceConfig = {
  id: string;
  apiBaseUrl: string;
  workspace?: string;
  auth:
    | { kongAdmin: string }
    | { custom: { header: string; value: string } };
};

export class KongServiceManagerService {
  readonly #logger: LoggerService;
  readonly #instances: KongInstanceConfig[];

  static create(options: { logger: LoggerService; config: Config }) {
    return new KongServiceManagerService(options.logger, options.config);
  }

  private constructor(logger: LoggerService, config: Config) {
    this.#logger = logger;
    this.#instances = this.readInstances(config);
    this.#logger.info(
      `Kong Service Manager initialized with ${this.#instances.length} instance(s)`,
    );
  }

  private readInstances(config: Config): KongInstanceConfig[] {
    if (!config.has('kong.instances')) {
      this.#logger.warn('No kong.instances configured');
      return [];
    }

    const instancesConfig = config.getConfigArray('kong.instances');
    return instancesConfig.map(c => {
      const id = c.getString('id');
      const apiBaseUrl = c.getString('apiBaseUrl');
      const workspace = c.getOptionalString('workspace');

      let auth: KongInstanceConfig['auth'];
      if (c.has('auth.kongAdmin')) {
        auth = { kongAdmin: c.getString('auth.kongAdmin') };
      } else if (c.has('auth.custom')) {
        auth = {
          custom: {
            header: c.getString('auth.custom.header'),
            value: c.getString('auth.custom.value'),
          },
        };
      } else {
        auth = { kongAdmin: '' };
      }

      return { id, apiBaseUrl, workspace, auth };
    });
  }

  private getInstance(instanceName: string): KongInstanceConfig {
    const instance = this.#instances.find(i => i.id === instanceName);
    if (!instance) {
      throw new NotFoundError(
        `Kong instance '${instanceName}' not found in configuration`,
      );
    }
    return instance;
  }

  private buildUrl(instance: KongInstanceConfig, path: string): string {
    const base = instance.apiBaseUrl.replace(/\/$/, '');
    if (instance.workspace) {
      return `${base}/${instance.workspace}${path}`;
    }
    return `${base}${path}`;
  }

  private buildHeaders(instance: KongInstanceConfig): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if ('kongAdmin' in instance.auth && instance.auth.kongAdmin) {
      headers['Kong-Admin-Token'] = instance.auth.kongAdmin;
    } else if ('custom' in instance.auth) {
      headers[instance.auth.custom.header] = instance.auth.custom.value;
    }

    return headers;
  }

  private async kongFetch<T>(
    instanceName: string,
    path: string,
    options?: RequestInit,
  ): Promise<T> {
    const instance = this.getInstance(instanceName);
    const url = this.buildUrl(instance, path);
    const headers = this.buildHeaders(instance);

    this.#logger.debug(`Kong API request: ${options?.method ?? 'GET'} ${url}`);

    const response = await fetch(url, {
      ...options,
      headers: { ...headers, ...options?.headers },
    });

    if (!response.ok) {
      const body = await response.text();
      this.#logger.error(
        `Kong API error: ${response.status} ${response.statusText} - ${body}`,
      );
      throw new Error(
        `Kong API request failed: ${response.status} ${response.statusText}`,
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  // --- Service operations ---

  async getServiceInfo(
    instanceName: string,
    serviceName: string,
  ): Promise<ServiceInfoResponse> {
    return this.kongFetch<ServiceInfoResponse>(
      instanceName,
      `/services/${encodeURIComponent(serviceName)}`,
    );
  }

  // --- Route operations ---

  async getRoutes(
    instanceName: string,
    serviceName: string,
  ): Promise<RoutesResponse> {
    return this.kongFetch<RoutesResponse>(
      instanceName,
      `/services/${encodeURIComponent(serviceName)}/routes`,
    );
  }

  async getRouteById(
    instanceName: string,
    serviceName: string,
    routeId: string,
  ): Promise<RouteResponse> {
    return this.kongFetch<RouteResponse>(
      instanceName,
      `/services/${encodeURIComponent(serviceName)}/routes/${encodeURIComponent(routeId)}`,
    );
  }

  async createRoute(
    instanceName: string,
    serviceName: string,
    route: CreateRoute,
  ): Promise<RouteResponse> {
    return this.kongFetch<RouteResponse>(
      instanceName,
      `/services/${encodeURIComponent(serviceName)}/routes`,
      {
        method: 'POST',
        body: JSON.stringify(route),
      },
    );
  }

  async editRoute(
    instanceName: string,
    serviceName: string,
    routeId: string,
    route: Partial<CreateRoute>,
  ): Promise<RouteResponse> {
    return this.kongFetch<RouteResponse>(
      instanceName,
      `/services/${encodeURIComponent(serviceName)}/routes/${encodeURIComponent(routeId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(route),
      },
    );
  }

  async removeRoute(
    instanceName: string,
    serviceName: string,
    routeId: string,
  ): Promise<void> {
    await this.kongFetch<void>(
      instanceName,
      `/services/${encodeURIComponent(serviceName)}/routes/${encodeURIComponent(routeId)}`,
      { method: 'DELETE' },
    );
  }

  // --- Plugin operations on services ---

  async getServiceAssociatedPlugins(
    instanceName: string,
    serviceName: string,
  ): Promise<AssociatedPluginsResponse[]> {
    const result = await this.kongFetch<{ data: AssociatedPluginsResponse[] }>(
      instanceName,
      `/services/${encodeURIComponent(serviceName)}/plugins`,
    );
    return result.data;
  }

  async getAvailablePlugins(
    instanceName: string,
  ): Promise<AvailablePluginsResponse> {
    return this.kongFetch<AvailablePluginsResponse>(
      instanceName,
      '/plugins/enabled',
    );
  }

  async getPluginFields(
    instanceName: string,
    pluginName: string,
  ): Promise<PluginFieldsResponse> {
    return this.kongFetch<PluginFieldsResponse>(
      instanceName,
      `/schemas/plugins/${encodeURIComponent(pluginName)}`,
    );
  }

  async addPluginToService(
    instanceName: string,
    serviceName: string,
    plugin: CreatePlugin,
  ): Promise<AssociatedPluginsResponse> {
    return this.kongFetch<AssociatedPluginsResponse>(
      instanceName,
      `/services/${encodeURIComponent(serviceName)}/plugins`,
      {
        method: 'POST',
        body: JSON.stringify(plugin),
      },
    );
  }

  async editServicePlugin(
    instanceName: string,
    serviceName: string,
    pluginId: string,
    plugin: Partial<CreatePlugin>,
  ): Promise<AssociatedPluginsResponse> {
    return this.kongFetch<AssociatedPluginsResponse>(
      instanceName,
      `/services/${encodeURIComponent(serviceName)}/plugins/${encodeURIComponent(pluginId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(plugin),
      },
    );
  }

  async removeServicePlugin(
    instanceName: string,
    serviceName: string,
    pluginId: string,
  ): Promise<void> {
    await this.kongFetch<void>(
      instanceName,
      `/services/${encodeURIComponent(serviceName)}/plugins/${encodeURIComponent(pluginId)}`,
      { method: 'DELETE' },
    );
  }

  // --- Plugin operations on routes ---

  async getRouteAssociatedPlugins(
    instanceName: string,
    routeId: string,
  ): Promise<AssociatedPluginsResponse[]> {
    const result = await this.kongFetch<{ data: AssociatedPluginsResponse[] }>(
      instanceName,
      `/routes/${encodeURIComponent(routeId)}/plugins`,
    );
    return result.data;
  }

  async addPluginToRoute(
    instanceName: string,
    routeId: string,
    plugin: CreatePlugin,
  ): Promise<AssociatedPluginsResponse> {
    return this.kongFetch<AssociatedPluginsResponse>(
      instanceName,
      `/routes/${encodeURIComponent(routeId)}/plugins`,
      {
        method: 'POST',
        body: JSON.stringify(plugin),
      },
    );
  }

  async editRoutePlugin(
    instanceName: string,
    routeId: string,
    pluginId: string,
    plugin: Partial<CreatePlugin>,
  ): Promise<AssociatedPluginsResponse> {
    return this.kongFetch<AssociatedPluginsResponse>(
      instanceName,
      `/routes/${encodeURIComponent(routeId)}/plugins/${encodeURIComponent(pluginId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(plugin),
      },
    );
  }

  async removeRoutePlugin(
    instanceName: string,
    routeId: string,
    pluginId: string,
  ): Promise<void> {
    await this.kongFetch<void>(
      instanceName,
      `/routes/${encodeURIComponent(routeId)}/plugins/${encodeURIComponent(pluginId)}`,
      { method: 'DELETE' },
    );
  }
}

export const kongServiceManagerServiceRef =
  createServiceRef<KongServiceManagerService>({
    id: 'kong-service-manager.service',
    defaultFactory: async service =>
      createServiceFactory({
        service,
        deps: {
          logger: coreServices.logger,
          config: coreServices.rootConfig,
        },
        async factory(deps) {
          return KongServiceManagerService.create(deps);
        },
      }),
  });
