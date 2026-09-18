import type {
  ServiceInfoResponse,
  RouteResponse,
  RoutesResponse,
  CreateRoute,
  AssociatedPluginsResponse,
  PluginFieldsResponse,
  CreatePlugin,
  PluginPerCategory,
  PromotionRecord,
  PromotionPreview,
  KongInstanceInfo,
  PromotionCapabilities,
} from './types';

/** Frontend API contract for Kong Service Manager */
export interface KongServiceManagerApi {
  /** List configured Kong instances, including their ownership-marker defaultTags */
  getInstances(): Promise<KongInstanceInfo[]>;

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

  /** Runtime prerequisites for promote-to-code (currently: helm) — fetch once and use it to disable the Promote action when unavailable. */
  getPromotionCapabilities(instance: string): Promise<PromotionCapabilities>;

  /**
   * Dry-run of a promotion — no side effects. Same permission/adapter gate as
   * promote; surfaces a renderCheck mismatch as a 400. `config` (issue #135,
   * "edit in code") previews an edit of an already code-owned plugin instead
   * of the live one — only accepted when the backend has `editInCode` on.
   */
  previewPromotion(
    instance: string,
    serviceName: string,
    routeId: string,
    pluginId: string,
    entityRef: string,
    config?: Record<string, unknown>,
  ): Promise<PromotionPreview>;

  /**
   * Promote an experimental route plugin to code (design 02) — opens an MR
   * in the owning repo. `config` (issue #135) edits an already code-owned
   * plugin directly instead — mode `code-only`, no experiment created.
   */
  promotePlugin(
    instance: string,
    serviceName: string,
    routeId: string,
    pluginId: string,
    entityRef: string,
    config?: Record<string, unknown>,
  ): Promise<PromotionRecord>;

  /** Discard an open promotion — closes its MR, untags the experiment, returns it to draft-free state. */
  discardPromotion(
    instance: string,
    serviceName: string,
    routeId: string,
    pluginId: string,
  ): Promise<void>;

  /**
   * Dry-run of a delete-in-code (issue #3) — no side effects. Returns the
   * chart file(s) that removing the code-owned plugin would delete. Gated the
   * same way as {@link demotePlugin}; a hand-modified template surfaces as a 400.
   */
  previewDemotion(
    instance: string,
    serviceName: string,
    routeId: string,
    pluginId: string,
    entityRef: string,
  ): Promise<PromotionPreview>;

  /**
   * Remove an already code-owned route plugin from the chart (issue #3) — opens
   * an MR deleting the plugin's generated template. The finalizer confirms the
   * plugin disappears from the gateway once the merge deploys.
   */
  demotePlugin(
    instance: string,
    serviceName: string,
    routeId: string,
    pluginId: string,
    entityRef: string,
  ): Promise<PromotionRecord>;

  /** Promotion history for a route plugin, newest first. Empty when promotion is disabled. */
  getPromotions(
    instance: string,
    serviceName: string,
    routeId: string,
    pluginId: string,
    /** Needed after delete-in-code removes the live plugin before its terminal record is read. */
    pluginType?: string,
  ): Promise<PromotionRecord[]>;
}
