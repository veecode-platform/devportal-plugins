/**
 * Kong Service Manager shared types.
 *
 * These types mirror the Kong Admin API response shapes and are shared
 * between the frontend and backend plugins.
 */

/** HTTP methods supported by Kong routes */
export type HttpMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'DELETE'
  | 'PATCH'
  | 'HEAD'
  | 'OPTIONS'
  | 'TRACE'
  | 'CONNECT';

/** Protocols supported by Kong routes */
export type RouteProtocol =
  | 'http'
  | 'https'
  | 'tcp'
  | 'tls'
  | 'tls_passthrough'
  | 'ws'
  | 'wss'
  | 'grpc'
  | 'grpcs';

/** Kong service info from Admin API */
export type ServiceInfoResponse = {
  id: string;
  name: string;
  protocol: string;
  host: string;
  port: number;
  path: string | null;
  retries: number;
  connect_timeout: number;
  write_timeout: number;
  read_timeout: number;
  enabled: boolean;
  created_at: number;
  updated_at: number;
  tags?: string[] | null;
};

/** Kong route from Admin API */
export type RouteResponse = {
  id: string;
  name: string | null;
  protocols: RouteProtocol[];
  methods: HttpMethod[] | null;
  hosts: string[] | null;
  paths: string[] | null;
  headers: Record<string, string[]> | null;
  https_redirect_status_code: number;
  regex_priority: number;
  strip_path: boolean;
  path_handling: string;
  preserve_host: boolean;
  request_buffering: boolean;
  response_buffering: boolean;
  tags?: string[] | null;
  service: { id: string } | null;
  created_at: number;
  updated_at: number;
};

/** Kong routes list response */
export type RoutesResponse = {
  data: RouteResponse[];
  next: string | null;
};

/** Payload for creating a route */
export type CreateRoute = {
  name?: string;
  protocols?: RouteProtocol[];
  methods?: HttpMethod[];
  hosts?: string[];
  paths?: string[];
  headers?: Record<string, string[]>;
  https_redirect_status_code?: number;
  regex_priority?: number;
  strip_path?: boolean;
  path_handling?: string;
  preserve_host?: boolean;
  request_buffering?: boolean;
  response_buffering?: boolean;
  tags?: string[];
};

/** Kong plugin associated with a service or route */
export type AssociatedPluginsResponse = {
  id: string;
  name: string;
  enabled: boolean;
  config: Record<string, unknown>;
  protocols: string[];
  tags?: string[] | null;
  created_at: number;
  service: { id: string } | null;
  route: { id: string } | null;
  consumer: { id: string } | null;
};

/** Plugin field schema from Kong introspection */
export type PluginFieldsResponse = {
  fields: SchemaField[];
};

/** Individual schema field descriptor */
export type SchemaField = {
  [key: string]: {
    type: string;
    required?: boolean;
    default?: unknown;
    elements?: { type: string };
    fields?: SchemaField[];
    one_of?: unknown[];
    between?: [number, number];
    len_min?: number;
    match_none?: Array<{ pattern: string; err?: string }>;
  };
};

/** Payload for creating/editing a plugin */
export type CreatePlugin = {
  name: string;
  config?: Record<string, unknown>;
  enabled?: boolean;
  protocols?: string[];
  tags?: string[];
};

/** Plugin card info for UI display */
export type PluginCard = {
  name: string;
  slug: string;
  associated: boolean;
  image?: string;
  description?: string;
};

/** Plugin category grouping */
export type PluginPerCategory = {
  category: string;
  plugins: PluginCard[];
};

/** Available plugins response from Kong */
export type AvailablePluginsResponse = {
  enabled_plugins: string[];
};

/** Plugin categories enum */
export enum PluginCategory {
  AI = 'ai',
  AUTHENTICATION = 'authentication',
  SECURITY = 'security',
  TRAFFIC_CONTROL = 'traffic-control',
  SERVERLESS = 'serverless',
  TRANSFORMATION = 'transformation',
  LOGGING = 'logging',
  ANALYTICS = 'analytics',
}
