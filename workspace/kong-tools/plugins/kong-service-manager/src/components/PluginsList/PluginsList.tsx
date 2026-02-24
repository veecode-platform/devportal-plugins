import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  CircularProgress,
  InputAdornment,
  Skeleton,
  TextField,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import {
  CardTab,
  ItemCardGrid,
  TabbedCard,
} from '@backstage/core-components';
import { useKongServiceManager } from '../../context/KongServiceManagerContext';
import { PluginCard } from './PluginCard';
import type { PluginPerCategory } from '@veecode-platform/backstage-plugin-kong-service-manager-common';

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

function PluginCardSkeleton() {
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

type PluginsListProps = {
  onEnablePlugin: (pluginSlug: string) => void;
  onEditPlugin: (pluginId: string, pluginName: string) => void;
};

export function PluginsList({ onEnablePlugin, onEditPlugin }: PluginsListProps) {
  const {
    state,
    fetchAssociatedPlugins,
    fetchAvailablePlugins,
    removeServicePlugin,
  } = useKongServiceManager();

  const {
    associatedPlugins,
    availablePlugins,
    loading,
    error,
    instance,
    serviceName,
  } = state;

  const [search, setSearch] = useState('');
  const [disablingId, setDisablingId] = useState<string | null>(null);

  useEffect(() => {
    if (instance && serviceName) {
      fetchAssociatedPlugins();
      fetchAvailablePlugins();
    }
  }, [instance, serviceName, fetchAssociatedPlugins, fetchAvailablePlugins]);

  const associatedMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of associatedPlugins) {
      map.set(p.name, p.id);
    }
    return map;
  }, [associatedPlugins]);

  const handleDisable = useCallback(
    async (pluginId: string, _pluginName: string) => {
      setDisablingId(pluginId);
      try {
        await removeServicePlugin(pluginId);
      } finally {
        setDisablingId(null);
      }
    },
    [removeServicePlugin],
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

  if (error) {
    return (
      <Box p={2}>
        <Typography color="error">{error}</Typography>
      </Box>
    );
  }

  const renderCategories = (categories: PluginPerCategory[]) => {
    if (loading && availablePlugins.length === 0) {
      return <PluginCardSkeleton />;
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
              onEnable={onEnablePlugin}
              onEdit={onEditPlugin}
              onDisable={handleDisable}
            />
          ))}
        </ItemCardGrid>
      </Box>
    ));
  };

  return (
    <Box>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
        <Typography variant="h5">Kong Plugins</Typography>
        <Box display="flex" alignItems="center" gap={1}>
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
      </Box>

      <TabbedCard title="">
        <CardTab label="All Plugins">
          <Box p={2}>{renderCategories(allFiltered)}</Box>
        </CardTab>
        <CardTab label="Associated Plugins">
          <Box p={2}>{renderCategories(associatedFiltered)}</Box>
        </CardTab>
      </TabbedCard>
    </Box>
  );
}
