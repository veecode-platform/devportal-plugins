import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  CircularProgress,
  Drawer,
  IconButton,
  InputAdornment,
  Skeleton,
  TextField,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import {
  CardTab,
  ItemCardGrid,
  TabbedCard,
} from '@backstage/core-components';
import { useKongServiceManager } from '../../context/KongServiceManagerContext';
import { PluginCard } from '../PluginsList/PluginCard';
import type {
  PluginPerCategory,
  RouteResponse,
} from '@veecode-platform/backstage-plugin-kong-service-manager-common';

const CATEGORY_LABELS: Record<string, string> = {
  ai: 'AI',
  authentication: 'Authentication',
  security: 'Security',
  'traffic-control': 'Traffic Control',
  serverless: 'Serverless',
  transformation: 'Transformations',
  logging: 'Logging',
  analytics: 'Analytics & Monitoring',
};

function formatCategory(slug: string): string {
  return (
    CATEGORY_LABELS[slug] ??
    slug
      .replace(/-/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase())
  );
}

type RoutePluginsDrawerProps = {
  open: boolean;
  route: RouteResponse | null;
  onClose: () => void;
  onEnablePlugin: (routeId: string, pluginSlug: string) => void;
  onEditPlugin: (routeId: string, pluginId: string, pluginName: string) => void;
  canEnable?: boolean;
  canDisable?: boolean;
  canEdit?: boolean;
};

export function RoutePluginsDrawer({
  open,
  route,
  onClose,
  onEnablePlugin,
  onEditPlugin,
  canEnable,
  canDisable,
  canEdit,
}: RoutePluginsDrawerProps) {
  const {
    state,
    fetchRouteAssociatedPlugins,
    fetchAvailablePlugins,
    removeRoutePlugin,
  } = useKongServiceManager();

  const { routeAssociatedPlugins, availablePlugins, loading, instance, serviceName } = state;

  const [search, setSearch] = useState('');
  const [disablingId, setDisablingId] = useState<string | null>(null);

  useEffect(() => {
    if (open && route && instance && serviceName) {
      fetchRouteAssociatedPlugins(route.id);
      if (availablePlugins.length === 0) {
        fetchAvailablePlugins();
      }
    }
  }, [open, route, instance, serviceName, fetchRouteAssociatedPlugins, fetchAvailablePlugins, availablePlugins.length]);

  useEffect(() => {
    if (!open) {
      setSearch('');
    }
  }, [open]);

  const associatedMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of routeAssociatedPlugins) {
      map.set(p.name, p.id);
    }
    return map;
  }, [routeAssociatedPlugins]);

  const handleDisable = useCallback(
    async (pluginId: string, _pluginName: string) => {
      if (!route) return;
      setDisablingId(pluginId);
      try {
        await removeRoutePlugin(route.id, pluginId);
      } finally {
        setDisablingId(null);
      }
    },
    [route, removeRoutePlugin],
  );

  const handleEnable = useCallback(
    (pluginSlug: string) => {
      if (route) onEnablePlugin(route.id, pluginSlug);
    },
    [route, onEnablePlugin],
  );

  const handleEdit = useCallback(
    (pluginId: string, pluginName: string) => {
      if (route) onEditPlugin(route.id, pluginId, pluginName);
    },
    [route, onEditPlugin],
  );

  const filterCategories = useCallback(
    (categories: PluginPerCategory[], onlyAssociated: boolean) => {
      const term = search.toLowerCase();
      return categories
        .map(cat => ({
          ...cat,
          plugins: cat.plugins.filter(p => {
            if (onlyAssociated && !associatedMap.has(p.slug)) return false;
            if (term && !p.name.toLowerCase().includes(term) && !p.slug.toLowerCase().includes(term)) {
              return false;
            }
            return true;
          }),
        }))
        .filter(cat => cat.plugins.length > 0);
    },
    [search, associatedMap],
  );

  const allFiltered = useMemo(
    () => filterCategories(availablePlugins, false),
    [availablePlugins, filterCategories],
  );

  const associatedFiltered = useMemo(
    () => filterCategories(availablePlugins, true),
    [availablePlugins, filterCategories],
  );

  const renderCategories = (categories: PluginPerCategory[]) => {
    if (loading && availablePlugins.length === 0) {
      return (
        <ItemCardGrid>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton
              key={i}
              variant="rectangular"
              height={220}
              sx={{ borderRadius: '8px' }}
            />
          ))}
        </ItemCardGrid>
      );
    }

    if (categories.length === 0) {
      return (
        <Box p={4} textAlign="center">
          <Typography color="text.secondary">No plugins to display</Typography>
        </Box>
      );
    }

    return categories.map(cat => (
      <Box key={cat.category} mb={3}>
        <Typography variant="h6" sx={{ mb: 1.5 }}>
          {formatCategory(cat.category)}
        </Typography>
        <ItemCardGrid>
          {cat.plugins.map(plugin => (
            <PluginCard
              key={plugin.slug}
              plugin={plugin}
              associatedId={associatedMap.get(plugin.slug)}
              disabling={disablingId === associatedMap.get(plugin.slug)}
              canEnable={canEnable}
              canDisable={canDisable}
              canEdit={canEdit}
              onEnable={handleEnable}
              onEdit={handleEdit}
              onDisable={handleDisable}
            />
          ))}
        </ItemCardGrid>
      </Box>
    ));
  };

  const routeLabel = route?.name ?? route?.id.slice(0, 8) ?? '';

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: '60%', minWidth: 500, maxWidth: 900 } }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', p: 2.5 }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h5">Plugins for route: {routeLabel}</Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>

        <Box display="flex" alignItems="center" justifyContent="flex-end" mb={2} gap={1}>
          {loading && <CircularProgress size={20} />}
          <TextField
            size="small"
            placeholder="Search plugins..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
            sx={{ width: 240 }}
          />
        </Box>

        <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
          <TabbedCard title="">
            <CardTab label="All Plugins">
              <Box p={2}>{renderCategories(allFiltered)}</Box>
            </CardTab>
            <CardTab label="Associated Plugins">
              <Box p={2}>{renderCategories(associatedFiltered)}</Box>
            </CardTab>
          </TabbedCard>
        </Box>
      </Box>
    </Drawer>
  );
}
