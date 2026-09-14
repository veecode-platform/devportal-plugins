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
import { useEntity } from '@backstage/plugin-catalog-react';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { useKongServiceManager } from '../../context/KongServiceManagerContext';
import { PluginCard } from '../PluginsList/PluginCard';
import { derivePromotionBadge } from './promotionBadge';
import { PromotionReviewDialog } from './PromotionReviewDialog';
import type {
  AssociatedPluginsResponse,
  PluginPerCategory,
  RouteResponse,
} from '@veecode-platform/backstage-plugin-kong-service-manager-common';

/** Mirrors GitlabClient's annotation key (backend, not exported to common) — the same key resolves the owning repo for promotion. */
const GITLAB_PROJECT_SLUG_ANNOTATION = 'gitlab.com/project-slug';

/** Spec 02's exact wording for the pure-route guardrail — a signposted dead end, not a silent one. */
const PURE_ROUTE_REASON =
  'No owning repo — exposure of repo-less APIs is a future milestone';

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
  canPromote?: boolean;
  onPromoted?: (pluginName: string) => void;
  onPromotionDiscarded?: (pluginName: string) => void;
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
  canPromote,
  onPromoted,
  onPromotionDiscarded,
}: RoutePluginsDrawerProps) {
  const {
    state,
    fetchRouteAssociatedPlugins,
    fetchAvailablePlugins,
    removeRoutePlugin,
    fetchPromotions,
    promotePlugin,
    discardPromotion,
  } = useKongServiceManager();
  const { entity } = useEntity();

  const {
    routeAssociatedPlugins,
    availablePlugins,
    loading,
    instance,
    serviceName,
    promotionsByPluginId,
  } = state;

  const [search, setSearch] = useState('');
  const [disablingId, setDisablingId] = useState<string | null>(null);
  const [discardingId, setDiscardingId] = useState<string | null>(null);
  const [reviewPlugin, setReviewPlugin] = useState<{ id: string; name: string; config: Record<string, unknown> } | null>(null);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const entityRef = useMemo(() => stringifyEntityRef(entity), [entity]);
  const promoteDisabledReason = entity.metadata.annotations?.[GITLAB_PROJECT_SLUG_ANNOTATION]
    ? undefined
    : PURE_ROUTE_REASON;

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

  // Promotion history is fetched per associated route plugin only (bounded
  // fan-out) — an unassociated plugin can't have a promotion.
  useEffect(() => {
    if (!open || !route) return;
    for (const plugin of routeAssociatedPlugins) {
      fetchPromotions(route.id, plugin.id);
    }
    // fetchPromotions is stable (useCallback in the provider); routeAssociatedPlugins
    // driving this is exactly the fan-out bound we want.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, route, routeAssociatedPlugins]);

  const associatedMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of routeAssociatedPlugins) {
      map.set(p.name, p.id);
    }
    return map;
  }, [routeAssociatedPlugins]);

  const associatedPluginById = useMemo(() => {
    const map = new Map<string, AssociatedPluginsResponse>();
    for (const p of routeAssociatedPlugins) {
      map.set(p.id, p);
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

  const handleOpenReview = useCallback(
    (pluginId: string, pluginName: string) => {
      const plugin = associatedPluginById.get(pluginId);
      setReviewError(null);
      setReviewPlugin({ id: pluginId, name: pluginName, config: plugin?.config ?? {} });
    },
    [associatedPluginById],
  );

  const handleCloseReview = useCallback(() => {
    if (reviewSubmitting) return;
    setReviewPlugin(null);
    setReviewError(null);
  }, [reviewSubmitting]);

  const handleConfirmPromote = useCallback(async () => {
    if (!route || !reviewPlugin) return;
    setReviewSubmitting(true);
    setReviewError(null);
    try {
      await promotePlugin(route.id, reviewPlugin.id, entityRef);
      const promotedName = reviewPlugin.name;
      setReviewPlugin(null);
      onPromoted?.(promotedName);
    } catch (e: unknown) {
      setReviewError(e instanceof Error ? e.message : String(e));
    } finally {
      setReviewSubmitting(false);
    }
  }, [route, reviewPlugin, entityRef, promotePlugin, onPromoted]);

  const handleDiscard = useCallback(
    async (pluginId: string, pluginName: string) => {
      if (!route) return;
      setDiscardingId(pluginId);
      try {
        await discardPromotion(route.id, pluginId);
        onPromotionDiscarded?.(pluginName);
      } finally {
        setDiscardingId(null);
      }
    },
    [route, discardPromotion, onPromotionDiscarded],
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
          {cat.plugins.map(plugin => {
            const pluginId = associatedMap.get(plugin.slug);
            const assocPlugin = pluginId ? associatedPluginById.get(pluginId) : undefined;
            const promotionBadge = pluginId
              ? derivePromotionBadge(promotionsByPluginId[pluginId], assocPlugin?.created_at ?? 0)
              : undefined;
            return (
              <PluginCard
                key={plugin.slug}
                plugin={plugin}
                associatedId={pluginId}
                disabling={disablingId === pluginId}
                canEnable={canEnable}
                canDisable={canDisable}
                canEdit={canEdit}
                onEnable={handleEnable}
                onEdit={handleEdit}
                onDisable={handleDisable}
                promotionBadge={promotionBadge}
                canPromote={canPromote}
                promoteDisabledReason={promoteDisabledReason}
                discardingPromotion={discardingId === pluginId}
                onPromote={handleOpenReview}
                onDiscardPromotion={handleDiscard}
              />
            );
          })}
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

      <PromotionReviewDialog
        open={!!reviewPlugin}
        pluginName={reviewPlugin?.name ?? ''}
        liveConfig={reviewPlugin?.config ?? {}}
        onClose={handleCloseReview}
        onConfirm={handleConfirmPromote}
        submitting={reviewSubmitting}
        error={reviewError}
      />
    </Drawer>
  );
}
