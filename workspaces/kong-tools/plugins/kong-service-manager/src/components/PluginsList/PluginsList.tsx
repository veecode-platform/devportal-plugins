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
import { useTranslation } from '../../hooks/useTranslation';
import { PluginCard } from './PluginCard';
import type { PluginPerCategory } from '@veecode-platform/backstage-plugin-kong-service-manager-common';
import type { TranslationFunction } from '@backstage/core-plugin-api/alpha';
import type { kongServiceManagerTranslationRef } from '../../translations';

function formatCategory(
  slug: string,
  t: TranslationFunction<typeof kongServiceManagerTranslationRef.T>,
): string {
  const categoryLabels: Record<string, string> = {
    ai: t('pluginsList.categories.ai'),
    authentication: t('pluginsList.categories.authentication'),
    security: t('pluginsList.categories.security'),
    'traffic-control': t('pluginsList.categories.trafficControl'),
    serverless: t('pluginsList.categories.serverless'),
    transformation: t('pluginsList.categories.transformation'),
    logging: t('pluginsList.categories.logging'),
    analytics: t('pluginsList.categories.analytics'),
  };
  return (
    categoryLabels[slug] ??
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
  onPluginDisabled?: (pluginName: string) => void;
  canEnable?: boolean;
  canDisable?: boolean;
  canEdit?: boolean;
};

export function PluginsList({ onEnablePlugin, onEditPlugin, onPluginDisabled, canEnable, canDisable, canEdit }: PluginsListProps) {
  const { t } = useTranslation();
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
    async (pluginId: string, pluginName: string) => {
      setDisablingId(pluginId);
      try {
        await removeServicePlugin(pluginId);
        onPluginDisabled?.(pluginName);
      } catch {
        // Error already handled by context (state.error)
      } finally {
        setDisablingId(null);
      }
    },
    [removeServicePlugin, onPluginDisabled],
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
      return <PluginCardSkeleton />;
    }

    if (categories.length === 0) {
      return (
        <Box p={4} textAlign="center">
          <Typography color="text.secondary">
            {search
              ? t('pluginsList.noPluginsFiltered', { search })
              : t('pluginsList.noPluginsEmpty')}
          </Typography>
        </Box>
      );
    }

    return categories.map(cat => (
      <Box key={cat.category} mb={3}>
        <Typography variant="h6" sx={{ mb: 1.5 }}>
          {formatCategory(cat.category, t)}
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
        <Typography variant="h5">{t('pluginsList.title')}</Typography>
        <Box display="flex" alignItems="center" gap={1}>
          {loading && <CircularProgress size={20} />}
          <TextField
            size="small"
            placeholder={t('pluginsList.searchPlaceholder')}
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
        <CardTab label={t('pluginsList.allPlugins')}>
          <Box p={2}>{renderCategories(allFiltered)}</Box>
        </CardTab>
        <CardTab label={t('pluginsList.associatedPlugins')}>
          <Box p={2}>{renderCategories(associatedFiltered)}</Box>
        </CardTab>
      </TabbedCard>
    </Box>
  );
}
