import type {
  ServiceInfoResponse,
  RouteResponse,
  RoutesResponse,
  CreateRoute,
  AssociatedPluginsResponse,
  PluginFieldsResponse,
  CreatePlugin,
  PluginPerCategory,
} from './types';

/** Frontend API contract for Kong Service Manager */
export interface KongServiceManagerApi {
  /** Get service details */
  getServiceInfo(
    instance: string,
    serviceName: string,
  ): Promise<ServiceInfoResponse>;

  /** List routes for a service */
  getRoutesFromService(
    instance: string,
    serviceName: string,
  ): Promise<RoutesResponse>;

  /** Get route by ID */
  getRouteById(
    instance: string,
    serviceName: string,
    routeId: string,
  ): Promise<RouteResponse>;

  /** Create a route on a service */
  createRoute(
    instance: string,
    serviceName: string,
    route: CreateRoute,
  ): Promise<RouteResponse>;

  /** Edit a route */
  editRoute(
    instance: string,
    serviceName: string,
    routeId: string,
    route: Partial<CreateRoute>,
  ): Promise<RouteResponse>;

  /** Delete a route */
  removeRoute(
    instance: string,
    serviceName: string,
    routeId: string,
  ): Promise<void>;

  /** List plugins associated with a service */
  getServiceAssociatedPlugins(
    instance: string,
    serviceName: string,
  ): Promise<AssociatedPluginsResponse[]>;

  /** List all available (enabled) plugins on a Kong instance */
  getAvailablePlugins(instance: string): Promise<PluginPerCategory[]>;

  /** Get plugin schema fields for introspection */
  getPluginFields(
    instance: string,
    pluginName: string,
  ): Promise<PluginFieldsResponse>;

  /** Add a plugin to a service */
  addPluginToService(
    instance: string,
    serviceName: string,
    plugin: CreatePlugin,
  ): Promise<AssociatedPluginsResponse>;

  /** Edit a plugin on a service */
  editServicePlugin(
    instance: string,
    serviceName: string,
    pluginId: string,
    plugin: Partial<CreatePlugin>,
  ): Promise<AssociatedPluginsResponse>;

  /** Remove a plugin from a service */
  removeServicePlugin(
    instance: string,
    serviceName: string,
    pluginId: string,
  ): Promise<void>;

  /** List plugins associated with a route */
  getRouteAssociatedPlugins(
    instance: string,
    routeId: string,
  ): Promise<AssociatedPluginsResponse[]>;

  /** Add a plugin to a route */
  addPluginToRoute(
    instance: string,
    routeId: string,
    plugin: CreatePlugin,
  ): Promise<AssociatedPluginsResponse>;

  /** Edit a plugin on a route */
  editRoutePlugin(
    instance: string,
    routeId: string,
    pluginId: string,
    plugin: Partial<CreatePlugin>,
  ): Promise<AssociatedPluginsResponse>;

  /** Remove a plugin from a route */
  removeRoutePlugin(
    instance: string,
    routeId: string,
    pluginId: string,
  ): Promise<void>;
}
