import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
} from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { kongServiceManagerApiRef } from '../api';
import {
  type AssociatedPluginsResponse,
  type ServiceInfoResponse,
  type PluginPerCategory,
  type RoutesResponse,
  type RouteResponse,
  type CreateRoute,
  type CreatePlugin,
  type PluginFieldsResponse,
} from '@veecode-platform/backstage-plugin-kong-service-manager-common';

type State = {
  instance: string;
  serviceName: string;
  serviceInfo: ServiceInfoResponse | null;
  associatedPlugins: AssociatedPluginsResponse[];
  availablePlugins: PluginPerCategory[];
  routes: RoutesResponse | null;
  selectedRoute: RouteResponse | null;
  routeAssociatedPlugins: AssociatedPluginsResponse[];
  pluginFields: PluginFieldsResponse | null;
  loading: boolean;
  error: string | null;
};

type Action =
  | { type: 'SET_INSTANCE'; instance: string }
  | { type: 'SET_SERVICE_NAME'; serviceName: string }
  | { type: 'SET_SERVICE_INFO'; data: ServiceInfoResponse }
  | { type: 'SET_ASSOCIATED_PLUGINS'; data: AssociatedPluginsResponse[] }
  | { type: 'SET_AVAILABLE_PLUGINS'; data: PluginPerCategory[] }
  | { type: 'SET_ROUTES'; data: RoutesResponse }
  | { type: 'SET_SELECTED_ROUTE'; data: RouteResponse | null }
  | { type: 'SET_ROUTE_ASSOCIATED_PLUGINS'; data: AssociatedPluginsResponse[] }
  | { type: 'SET_PLUGIN_FIELDS'; data: PluginFieldsResponse | null }
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'SET_ERROR'; error: string | null };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_INSTANCE':
      return { ...state, instance: action.instance };
    case 'SET_SERVICE_NAME':
      return { ...state, serviceName: action.serviceName };
    case 'SET_SERVICE_INFO':
      return { ...state, serviceInfo: action.data };
    case 'SET_ASSOCIATED_PLUGINS':
      return { ...state, associatedPlugins: action.data };
    case 'SET_AVAILABLE_PLUGINS':
      return { ...state, availablePlugins: action.data };
    case 'SET_ROUTES':
      return { ...state, routes: action.data };
    case 'SET_SELECTED_ROUTE':
      return { ...state, selectedRoute: action.data };
    case 'SET_ROUTE_ASSOCIATED_PLUGINS':
      return { ...state, routeAssociatedPlugins: action.data };
    case 'SET_PLUGIN_FIELDS':
      return { ...state, pluginFields: action.data };
    case 'SET_LOADING':
      return { ...state, loading: action.loading };
    case 'SET_ERROR':
      return { ...state, error: action.error };
    default:
      return state;
  }
}

const initialState: State = {
  instance: '',
  serviceName: '',
  serviceInfo: null,
  associatedPlugins: [],
  availablePlugins: [],
  routes: null,
  selectedRoute: null,
  routeAssociatedPlugins: [],
  pluginFields: null,
  loading: false,
  error: null,
};

type KongServiceManagerContextValue = {
  state: State;
  setInstance: (instance: string) => void;
  setServiceName: (serviceName: string) => void;
  fetchServiceInfo: () => Promise<void>;
  fetchAssociatedPlugins: () => Promise<void>;
  fetchAvailablePlugins: () => Promise<void>;
  fetchRoutes: () => Promise<void>;
  fetchRouteById: (routeId: string) => Promise<void>;
  fetchPluginFields: (pluginName: string) => Promise<void>;
  addPluginToService: (plugin: CreatePlugin) => Promise<void>;
  editServicePlugin: (pluginId: string, plugin: Partial<CreatePlugin>) => Promise<void>;
  removeServicePlugin: (pluginId: string) => Promise<void>;
  createRoute: (route: CreateRoute) => Promise<void>;
  editRoute: (routeId: string, route: Partial<CreateRoute>) => Promise<void>;
  removeRoute: (routeId: string) => Promise<void>;
  fetchRouteAssociatedPlugins: (routeId: string) => Promise<void>;
  addPluginToRoute: (routeId: string, plugin: CreatePlugin) => Promise<void>;
  editRoutePlugin: (routeId: string, pluginId: string, plugin: Partial<CreatePlugin>) => Promise<void>;
  removeRoutePlugin: (routeId: string, pluginId: string) => Promise<void>;
};

const KongServiceManagerContext =
  createContext<KongServiceManagerContextValue | null>(null);

export function KongServiceManagerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const api = useApi(kongServiceManagerApiRef);
  const [state, dispatch] = useReducer(reducer, initialState);

  const setInstance = useCallback((instance: string) => {
    dispatch({ type: 'SET_INSTANCE', instance });
  }, []);

  const setServiceName = useCallback((serviceName: string) => {
    dispatch({ type: 'SET_SERVICE_NAME', serviceName });
  }, []);

  const withLoading = useCallback(
    async (fn: () => Promise<void>) => {
      dispatch({ type: 'SET_LOADING', loading: true });
      dispatch({ type: 'SET_ERROR', error: null });
      try {
        await fn();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        dispatch({ type: 'SET_ERROR', error: msg });
      } finally {
        dispatch({ type: 'SET_LOADING', loading: false });
      }
    },
    [],
  );

  const fetchServiceInfo = useCallback(async () => {
    await withLoading(async () => {
      const data = await api.getServiceInfo(state.instance, state.serviceName);
      dispatch({ type: 'SET_SERVICE_INFO', data });
    });
  }, [api, state.instance, state.serviceName, withLoading]);

  const fetchAssociatedPlugins = useCallback(async () => {
    await withLoading(async () => {
      const data = await api.getServiceAssociatedPlugins(
        state.instance,
        state.serviceName,
      );
      dispatch({ type: 'SET_ASSOCIATED_PLUGINS', data });
    });
  }, [api, state.instance, state.serviceName, withLoading]);

  const fetchAvailablePlugins = useCallback(async () => {
    await withLoading(async () => {
      const data = await api.getAvailablePlugins(state.instance);
      dispatch({ type: 'SET_AVAILABLE_PLUGINS', data });
    });
  }, [api, state.instance, withLoading]);

  const fetchRoutes = useCallback(async () => {
    await withLoading(async () => {
      const data = await api.getRoutesFromService(
        state.instance,
        state.serviceName,
      );
      dispatch({ type: 'SET_ROUTES', data });
    });
  }, [api, state.instance, state.serviceName, withLoading]);

  const fetchRouteById = useCallback(
    async (routeId: string) => {
      await withLoading(async () => {
        const data = await api.getRouteById(
          state.instance,
          state.serviceName,
          routeId,
        );
        dispatch({ type: 'SET_SELECTED_ROUTE', data });
      });
    },
    [api, state.instance, state.serviceName, withLoading],
  );

  const fetchPluginFields = useCallback(
    async (pluginName: string) => {
      await withLoading(async () => {
        const data = await api.getPluginFields(state.instance, pluginName);
        dispatch({ type: 'SET_PLUGIN_FIELDS', data });
      });
    },
    [api, state.instance, withLoading],
  );

  const addPluginToService = useCallback(
    async (plugin: CreatePlugin) => {
      await withLoading(async () => {
        await api.addPluginToService(state.instance, state.serviceName, plugin);
        const data = await api.getServiceAssociatedPlugins(
          state.instance,
          state.serviceName,
        );
        dispatch({ type: 'SET_ASSOCIATED_PLUGINS', data });
      });
    },
    [api, state.instance, state.serviceName, withLoading],
  );

  const editServicePlugin = useCallback(
    async (pluginId: string, plugin: Partial<CreatePlugin>) => {
      await withLoading(async () => {
        await api.editServicePlugin(
          state.instance,
          state.serviceName,
          pluginId,
          plugin,
        );
        const data = await api.getServiceAssociatedPlugins(
          state.instance,
          state.serviceName,
        );
        dispatch({ type: 'SET_ASSOCIATED_PLUGINS', data });
      });
    },
    [api, state.instance, state.serviceName, withLoading],
  );

  const removeServicePlugin = useCallback(
    async (pluginId: string) => {
      await withLoading(async () => {
        await api.removeServicePlugin(
          state.instance,
          state.serviceName,
          pluginId,
        );
        const data = await api.getServiceAssociatedPlugins(
          state.instance,
          state.serviceName,
        );
        dispatch({ type: 'SET_ASSOCIATED_PLUGINS', data });
      });
    },
    [api, state.instance, state.serviceName, withLoading],
  );

  const createRouteAction = useCallback(
    async (route: CreateRoute) => {
      await withLoading(async () => {
        await api.createRoute(state.instance, state.serviceName, route);
        const data = await api.getRoutesFromService(
          state.instance,
          state.serviceName,
        );
        dispatch({ type: 'SET_ROUTES', data });
      });
    },
    [api, state.instance, state.serviceName, withLoading],
  );

  const editRoute = useCallback(
    async (routeId: string, route: Partial<CreateRoute>) => {
      await withLoading(async () => {
        await api.editRoute(state.instance, state.serviceName, routeId, route);
        const data = await api.getRoutesFromService(
          state.instance,
          state.serviceName,
        );
        dispatch({ type: 'SET_ROUTES', data });
      });
    },
    [api, state.instance, state.serviceName, withLoading],
  );

  const removeRoute = useCallback(
    async (routeId: string) => {
      await withLoading(async () => {
        await api.removeRoute(state.instance, state.serviceName, routeId);
        const data = await api.getRoutesFromService(
          state.instance,
          state.serviceName,
        );
        dispatch({ type: 'SET_ROUTES', data });
      });
    },
    [api, state.instance, state.serviceName, withLoading],
  );

  const fetchRouteAssociatedPlugins = useCallback(
    async (routeId: string) => {
      await withLoading(async () => {
        const data = await api.getRouteAssociatedPlugins(
          state.instance,
          routeId,
        );
        dispatch({ type: 'SET_ROUTE_ASSOCIATED_PLUGINS', data });
      });
    },
    [api, state.instance, withLoading],
  );

  const addPluginToRoute = useCallback(
    async (routeId: string, plugin: CreatePlugin) => {
      await withLoading(async () => {
        await api.addPluginToRoute(state.instance, routeId, plugin);
        const data = await api.getRouteAssociatedPlugins(
          state.instance,
          routeId,
        );
        dispatch({ type: 'SET_ROUTE_ASSOCIATED_PLUGINS', data });
      });
    },
    [api, state.instance, withLoading],
  );

  const editRoutePlugin = useCallback(
    async (routeId: string, pluginId: string, plugin: Partial<CreatePlugin>) => {
      await withLoading(async () => {
        await api.editRoutePlugin(state.instance, routeId, pluginId, plugin);
        const data = await api.getRouteAssociatedPlugins(
          state.instance,
          routeId,
        );
        dispatch({ type: 'SET_ROUTE_ASSOCIATED_PLUGINS', data });
      });
    },
    [api, state.instance, withLoading],
  );

  const removeRoutePlugin = useCallback(
    async (routeId: string, pluginId: string) => {
      await withLoading(async () => {
        await api.removeRoutePlugin(state.instance, routeId, pluginId);
        const data = await api.getRouteAssociatedPlugins(
          state.instance,
          routeId,
        );
        dispatch({ type: 'SET_ROUTE_ASSOCIATED_PLUGINS', data });
      });
    },
    [api, state.instance, withLoading],
  );

  const value = useMemo<KongServiceManagerContextValue>(
    () => ({
      state,
      setInstance,
      setServiceName,
      fetchServiceInfo,
      fetchAssociatedPlugins,
      fetchAvailablePlugins,
      fetchRoutes,
      fetchRouteById,
      fetchPluginFields,
      addPluginToService,
      editServicePlugin,
      removeServicePlugin,
      createRoute: createRouteAction,
      editRoute,
      removeRoute,
      fetchRouteAssociatedPlugins,
      addPluginToRoute,
      editRoutePlugin,
      removeRoutePlugin,
    }),
    [
      state,
      setInstance,
      setServiceName,
      fetchServiceInfo,
      fetchAssociatedPlugins,
      fetchAvailablePlugins,
      fetchRoutes,
      fetchRouteById,
      fetchPluginFields,
      addPluginToService,
      editServicePlugin,
      removeServicePlugin,
      createRouteAction,
      editRoute,
      removeRoute,
      fetchRouteAssociatedPlugins,
      addPluginToRoute,
      editRoutePlugin,
      removeRoutePlugin,
    ],
  );

  return (
    <KongServiceManagerContext.Provider value={value}>
      {children}
    </KongServiceManagerContext.Provider>
  );
}

export function useKongServiceManager(): KongServiceManagerContextValue {
  const ctx = useContext(KongServiceManagerContext);
  if (!ctx) {
    throw new Error(
      'useKongServiceManager must be used within a KongServiceManagerProvider',
    );
  }
  return ctx;
}
