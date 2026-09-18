import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
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
  type PromotionRecord,
  type PromotionPreview,
  type KongInstanceInfo,
  type PromotionCapabilities,
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
  /** Identity of the schema currently in `pluginFields`; prevents a previous plugin/instance from seeding a new drawer. */
  pluginFieldsKey: string | null;
  /** Promotion history per route plugin id (design 02 / plan P5) — only populated for plugins the drawer has fetched. */
  promotionsByPluginId: Record<string, PromotionRecord[]>;
  /** Configured Kong instances, including ownership-marker defaultTags — empty until fetchInstances resolves. */
  kongInstances: KongInstanceInfo[];
  /** Runtime prerequisites for promote-to-code (currently: helm) — null until the drawer's first fetch. */
  promotionCapabilities: PromotionCapabilities | null;
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
  | { type: 'SET_PLUGIN_FIELDS'; data: PluginFieldsResponse | null; key: string | null }
  | { type: 'SET_PROMOTIONS_FOR_PLUGIN'; pluginId: string; data: PromotionRecord[] }
  | { type: 'SET_KONG_INSTANCES'; data: KongInstanceInfo[] }
  | { type: 'SET_PROMOTION_CAPABILITIES'; data: PromotionCapabilities }
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
      return { ...state, pluginFields: action.data, pluginFieldsKey: action.key };
    case 'SET_PROMOTIONS_FOR_PLUGIN':
      return {
        ...state,
        promotionsByPluginId: {
          ...state.promotionsByPluginId,
          [action.pluginId]: action.data,
        },
      };
    case 'SET_KONG_INSTANCES':
      return { ...state, kongInstances: action.data };
    case 'SET_PROMOTION_CAPABILITIES':
      return { ...state, promotionCapabilities: action.data };
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
  pluginFieldsKey: null,
  promotionsByPluginId: {},
  kongInstances: [],
  promotionCapabilities: null,
  loading: false,
  error: null,
};

type KongServiceManagerContextValue = {
  state: State;
  setInstance: (instance: string) => void;
  setServiceName: (serviceName: string) => void;
  clearError: () => void;
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
  fetchPromotions: (routeId: string, pluginId: string, pluginType?: string) => Promise<void>;
  /** Background refresh of a plugin's promotion history — silent (no global spinner/error), for polling an in-flight promotion to its terminal state. */
  refreshPromotions: (routeId: string, pluginId: string, pluginType?: string) => Promise<void>;
  /** Background refresh of a route's associated plugins — silent, so a finalized handover (experiment removed, plugin now code-owned) shows up without a manual reopen. */
  refreshRouteAssociatedPlugins: (routeId: string) => Promise<void>;
  /** Fetches the configured Kong instances (for ownership-marker defaultTags). Best-effort: a denied/failed call leaves `kongInstances` empty rather than surfacing the global error, since only the promotion badge depends on it and an empty list degrades safely to "no ownership gate". */
  fetchInstances: () => Promise<void>;
  fetchPromotionCapabilities: () => Promise<void>;
  previewPromotion: (routeId: string, pluginId: string, entityRef: string, config?: Record<string, unknown>) => Promise<PromotionPreview>;
  promotePlugin: (routeId: string, pluginId: string, entityRef: string, config?: Record<string, unknown>) => Promise<PromotionRecord>;
  discardPromotion: (routeId: string, pluginId: string) => Promise<void>;
  /** Dry-run of a delete-in-code (issue #3) — dialog-scoped, no global spinner. */
  previewDemotion: (routeId: string, pluginId: string, entityRef: string) => Promise<PromotionPreview>;
  /** Remove a code-owned route plugin from the chart (issue #3) — opens the removal MR. */
  demotePlugin: (routeId: string, pluginId: string, entityRef: string) => Promise<PromotionRecord>;
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
  const pluginFieldsRequestRef = useRef(0);

  const setInstance = useCallback((instance: string) => {
    dispatch({ type: 'SET_INSTANCE', instance });
  }, []);

  const setServiceName = useCallback((serviceName: string) => {
    dispatch({ type: 'SET_SERVICE_NAME', serviceName });
  }, []);

  const clearError = useCallback(() => {
    dispatch({ type: 'SET_ERROR', error: null });
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
        throw e;
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
      const requestId = ++pluginFieldsRequestRef.current;
      const key = `${state.instance}:${pluginName}`;
      // Clear the shared slot first: it holds one global schema, so without
      // this a drawer opened right after another would render the previous
      // plugin's fields until the new schema lands (stale-slot first-open bug).
      dispatch({ type: 'SET_PLUGIN_FIELDS', data: null, key: null });
      await withLoading(async () => {
        const data = await api.getPluginFields(state.instance, pluginName);
        // A drawer can change plugin or instance while an earlier request is
        // still in flight. Only the latest response may populate the shared
        // schema slot; otherwise the old response can seed the new form.
        if (requestId === pluginFieldsRequestRef.current) {
          dispatch({ type: 'SET_PLUGIN_FIELDS', data, key });
        }
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

  const fetchPromotions = useCallback(
    async (routeId: string, pluginId: string, pluginType?: string) => {
      await withLoading(async () => {
        const data = await api.getPromotions(state.instance, state.serviceName, routeId, pluginId, pluginType);
        dispatch({ type: 'SET_PROMOTIONS_FOR_PLUGIN', pluginId, data });
      });
    },
    [api, state.instance, state.serviceName, withLoading],
  );

  // Deliberately skips withLoading: withLoading dispatches SET_ERROR and
  // rethrows on failure, which would pop the global error snackbar and
  // interrupt a drawer that otherwise worked fine. A denied or failed
  // /instances call just leaves kongInstances empty, which is the same as
  // "no ownership signal" — the promotion badge falls back to today's
  // behaviour instead of the request surfacing as a user-facing error.
  // Silent background refreshers (skip withLoading): a poll must not toggle the
  // page-wide spinner or clear the error snackbar every few seconds. A transient
  // failure is swallowed — the next tick retries.
  const refreshPromotions = useCallback(
    async (routeId: string, pluginId: string, pluginType?: string) => {
      try {
        const data = await api.getPromotions(state.instance, state.serviceName, routeId, pluginId, pluginType);
        dispatch({ type: 'SET_PROMOTIONS_FOR_PLUGIN', pluginId, data });
      } catch {
        // best-effort — see comment above
      }
    },
    [api, state.instance, state.serviceName],
  );

  const refreshRouteAssociatedPlugins = useCallback(
    async (routeId: string) => {
      try {
        const data = await api.getRouteAssociatedPlugins(state.instance, routeId);
        dispatch({ type: 'SET_ROUTE_ASSOCIATED_PLUGINS', data });
      } catch {
        // best-effort — see comment above
      }
    },
    [api, state.instance],
  );

  const fetchInstances = useCallback(async () => {
    try {
      const data = await api.getInstances();
      dispatch({ type: 'SET_KONG_INSTANCES', data });
    } catch {
      // best-effort — see comment above
    }
  }, [api]);

  const fetchPromotionCapabilities = useCallback(async () => {
    await withLoading(async () => {
      const data = await api.getPromotionCapabilities(state.instance);
      dispatch({ type: 'SET_PROMOTION_CAPABILITIES', data });
    });
  }, [api, state.instance, withLoading]);

  // No side effects (design 02's preview) and dialog-scoped — unlike the
  // other actions this deliberately skips withLoading/dispatch so a preview
  // never toggles the page-wide loading spinner or surfaces its error in the
  // global error snackbar; the caller (the review dialog) owns that state.
  const previewPromotion = useCallback(
    async (routeId: string, pluginId: string, entityRef: string, config?: Record<string, unknown>) =>
      api.previewPromotion(state.instance, state.serviceName, routeId, pluginId, entityRef, config),
    [api, state.instance, state.serviceName],
  );

  const promotePluginAction = useCallback(
    async (routeId: string, pluginId: string, entityRef: string, config?: Record<string, unknown>) => {
      let result!: PromotionRecord;
      await withLoading(async () => {
        result = await api.promotePlugin(state.instance, state.serviceName, routeId, pluginId, entityRef, config);
        const data = await api.getPromotions(state.instance, state.serviceName, routeId, pluginId);
        dispatch({ type: 'SET_PROMOTIONS_FOR_PLUGIN', pluginId, data });
      });
      return result;
    },
    [api, state.instance, state.serviceName, withLoading],
  );

  const discardPromotion = useCallback(
    async (routeId: string, pluginId: string) => {
      await withLoading(async () => {
        await api.discardPromotion(state.instance, state.serviceName, routeId, pluginId);
        const data = await api.getPromotions(state.instance, state.serviceName, routeId, pluginId);
        dispatch({ type: 'SET_PROMOTIONS_FOR_PLUGIN', pluginId, data });
      });
    },
    [api, state.instance, state.serviceName, withLoading],
  );

  // Dialog-scoped like previewPromotion: no withLoading, so the removal review
  // dialog owns its own loading/error and never toggles the page spinner.
  const previewDemotion = useCallback(
    async (routeId: string, pluginId: string, entityRef: string) =>
      api.previewDemotion(state.instance, state.serviceName, routeId, pluginId, entityRef),
    [api, state.instance, state.serviceName],
  );

  const demotePluginAction = useCallback(
    async (routeId: string, pluginId: string, entityRef: string) => {
      let result!: PromotionRecord;
      await withLoading(async () => {
        result = await api.demotePlugin(state.instance, state.serviceName, routeId, pluginId, entityRef);
        const data = await api.getPromotions(state.instance, state.serviceName, routeId, pluginId);
        dispatch({ type: 'SET_PROMOTIONS_FOR_PLUGIN', pluginId, data });
      });
      return result;
    },
    [api, state.instance, state.serviceName, withLoading],
  );

  const value = useMemo<KongServiceManagerContextValue>(
    () => ({
      state,
      setInstance,
      setServiceName,
      clearError,
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
      fetchPromotions,
      refreshPromotions,
      refreshRouteAssociatedPlugins,
      fetchInstances,
      fetchPromotionCapabilities,
      previewPromotion,
      promotePlugin: promotePluginAction,
      discardPromotion,
      previewDemotion,
      demotePlugin: demotePluginAction,
    }),
    [
      state,
      setInstance,
      setServiceName,
      clearError,
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
      fetchPromotions,
      refreshPromotions,
      refreshRouteAssociatedPlugins,
      fetchInstances,
      fetchPromotionCapabilities,
      previewPromotion,
      promotePluginAction,
      discardPromotion,
      previewDemotion,
      demotePluginAction,
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
