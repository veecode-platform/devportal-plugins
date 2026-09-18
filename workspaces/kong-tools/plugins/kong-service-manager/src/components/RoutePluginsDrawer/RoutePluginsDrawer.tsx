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
import { useTranslation } from '../../hooks/useTranslation';
import { PluginCard } from '../PluginsList/PluginCard';
import { PluginConfigDrawer } from '../PluginConfigDrawer/PluginConfigDrawer';
import { derivePromotionBadge } from './promotionBadge';
import { PromotionReviewDialog } from './PromotionReviewDialog';
import { CodeRemovalDialog } from './CodeRemovalDialog';
import type {
  AssociatedPluginsResponse,
  PluginPerCategory,
  RouteResponse,
} from '@veecode-platform/backstage-plugin-kong-service-manager-common';
import type { TranslationFunction } from '@backstage/core-plugin-api/alpha';
import type { kongServiceManagerTranslationRef } from '../../translations';

/** Mirrors GitlabClient's annotation key (backend, not exported to common) — the same key resolves the owning repo for promotion. */
const GITLAB_PROJECT_SLUG_ANNOTATION = 'gitlab.com/project-slug';

/** Non-terminal promotion states — a record in one of these is still in flight (MR open, deploy pending, applying), so the badge keeps changing on its own and the drawer polls until it settles. */
const ACTIVE_PROMOTION_STATES = new Set([
  'draft',
  'mr-open',
  'awaiting-deploy',
  'applying',
]);

/** How often the drawer refreshes an in-flight promotion. Kept coarse: the pipeline (MR → merge → deploy → finalizer) moves in tens of seconds at best. */
const PROMOTION_POLL_INTERVAL_MS = 5000;

function formatCategory(
  slug: string,
  t: TranslationFunction<typeof kongServiceManagerTranslationRef.T>,
): string {
  const categoryLabels: Record<string, string> = {
    ai: t('routePluginsDrawer.categories.ai'),
    authentication: t('routePluginsDrawer.categories.authentication'),
    security: t('routePluginsDrawer.categories.security'),
    'traffic-control': t('routePluginsDrawer.categories.trafficControl'),
    serverless: t('routePluginsDrawer.categories.serverless'),
    transformation: t('routePluginsDrawer.categories.transformation'),
    logging: t('routePluginsDrawer.categories.logging'),
    analytics: t('routePluginsDrawer.categories.analytics'),
  };
  return (
    categoryLabels[slug] ??
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
  canToggleEnabled?: boolean;
  canEdit?: boolean;
  canPromote?: boolean;
  onPromoted?: (pluginName: string) => void;
  onPromotionDiscarded?: (pluginName: string) => void;
  /** Delete-in-code (issue #3): a removal MR was opened for a code-owned plugin. */
  onRemovalOpened?: (pluginName: string) => void;
};

export function RoutePluginsDrawer({
  open,
  route,
  onClose,
  onEnablePlugin,
  onEditPlugin,
  canEnable,
  canToggleEnabled,
  canEdit,
  canPromote,
  onPromoted,
  onPromotionDiscarded,
  onRemovalOpened,
}: RoutePluginsDrawerProps) {
  const { t } = useTranslation();
  const {
    state,
    fetchRouteAssociatedPlugins,
    fetchAvailablePlugins,
    editRoutePlugin,
    fetchPromotions,
    refreshPromotions,
    refreshRouteAssociatedPlugins,
    fetchInstances,
    fetchPromotionCapabilities,
    promotePlugin,
    discardPromotion,
    demotePlugin,
  } = useKongServiceManager();
  const { entity } = useEntity();

  const {
    routeAssociatedPlugins,
    availablePlugins,
    loading,
    instance,
    serviceName,
    promotionsByPluginId,
    kongInstances,
    promotionCapabilities,
  } = state;

  const [search, setSearch] = useState('');
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [discardingId, setDiscardingId] = useState<string | null>(null);
  const [reviewPlugin, setReviewPlugin] = useState<{
    id: string;
    name: string;
    config: Record<string, unknown>;
    /** Set only for an edit-in-code review (issue #135) — the config the user just edited for an already code-owned plugin. */
    editedConfig?: Record<string, unknown>;
  } | null>(null);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  // Edit-in-code (issue #135): a second PluginConfigDrawer instance, in
  // 'code' mode, mounted here (not in the parent homepage) so its submit
  // can hand the edited config straight to the review dialog below.
  const [codeEditTarget, setCodeEditTarget] = useState<{ id: string; name: string; config: Record<string, unknown> } | null>(null);
  // Delete-in-code (issue #3): the code-owned plugin the removal review dialog targets.
  const [removeTarget, setRemoveTarget] = useState<{ id: string; name: string } | null>(null);
  const [removeSubmitting, setRemoveSubmitting] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const entityRef = useMemo(() => stringifyEntityRef(entity), [entity]);
  // Pure-route (no owning repo) takes priority — helm availability is moot
  // when there's nowhere to promote to. Otherwise, an unavailable helm
  // prerequisite reuses the backend's own actionable message verbatim.
  const promoteDisabledReason = !entity.metadata.annotations?.[GITLAB_PROJECT_SLUG_ANNOTATION]
    ? t('routePluginsDrawer.noOwningRepoReason')
    : promotionCapabilities && !promotionCapabilities.helm.available
      ? promotionCapabilities.helm.error
      : undefined;

  useEffect(() => {
    if (open && route && instance && serviceName) {
      fetchRouteAssociatedPlugins(route.id);
      if (availablePlugins.length === 0) {
        fetchAvailablePlugins();
      }
      if (kongInstances.length === 0) {
        fetchInstances();
      }
    }
  }, [
    open,
    route,
    instance,
    serviceName,
    fetchRouteAssociatedPlugins,
    fetchAvailablePlugins,
    availablePlugins.length,
    fetchInstances,
    kongInstances.length,
  ]);

  // Fetched once per drawer session — helm availability doesn't change
  // request-to-request, and a fixed deployment is picked up on next open.
  useEffect(() => {
    if (open && instance && promotionCapabilities === null) {
      fetchPromotionCapabilities();
    }
  }, [open, instance, promotionCapabilities, fetchPromotionCapabilities]);

  useEffect(() => {
    if (!open) {
      setSearch('');
    }
  }, [open]);

  // Promotion history is initially fetched per associated route plugin only
  // (bounded fan-out). An in-flight delete can then make that plugin
  // unassociated while its promotion record still needs polling, so the
  // active-ID calculation below retains already-loaded histories.
  const associatedPluginIdsKey = useMemo(
    () => routeAssociatedPlugins.map(plugin => plugin.id).sort().join('|'),
    [routeAssociatedPlugins],
  );
  useEffect(() => {
    if (!open || !route) return;
    for (const pluginId of associatedPluginIdsKey.split('|').filter(Boolean)) {
      // Keep the type in the request. A delete-to-code handover removes the
      // live plugin before its terminal promotion record is read, so the
      // backend cannot infer the type from Kong on that later poll.
      const pluginType = routeAssociatedPlugins.find(plugin => plugin.id === pluginId)?.name;
      fetchPromotions(route.id, pluginId, pluginType);
    }
    // The key, rather than the array identity, keeps a silent refresh from
    // refetching every history while still rerunning when an ID is added or
    // removed. Plugin names are stable for a given ID.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, route?.id, associatedPluginIdsKey, fetchPromotions]);

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

  // Route plugin histories whose latest promotion record is still in flight —
  // the set the drawer must poll so "Applying"/"MR open" advances to
  // "Codified" on its own. Iterate the histories rather than the associated
  // plugin list: a delete-to-code handover removes the plugin from Kong before
  // the finalizer can observe the disappearance and terminalize the record.
  const activePromotionPluginIds = useMemo(() => {
    const ids: string[] = [];
    for (const [pluginId, records] of Object.entries(promotionsByPluginId)) {
      if (!records || records.length === 0) continue;
      const latest = records.reduce((a, b) =>
        new Date(a.updatedAt).getTime() >= new Date(b.updatedAt).getTime() ? a : b,
      );
      if (ACTIVE_PROMOTION_STATES.has(latest.state)) ids.push(pluginId);
    }
    return ids.sort();
  }, [promotionsByPluginId]);

  // Poll while any promotion is in flight; stop as soon as none is. `activeKey`
  // keys the subscription to the *set* of in-flight plugins, so a background
  // refresh that only changes a record's timestamp doesn't tear down the timer.
  const activeKey = activePromotionPluginIds.join('|');
  useEffect(() => {
    if (!open || !route || activePromotionPluginIds.length === 0) return undefined;
    const interval = setInterval(() => {
      for (const id of activePromotionPluginIds) {
        const records = promotionsByPluginId[id];
        const latest = records?.reduce((a, b) =>
          new Date(a.updatedAt).getTime() >= new Date(b.updatedAt).getTime() ? a : b,
        );
        refreshPromotions(route.id, id, latest?.pluginType);
      }
      // The handover removes the experiment and re-tags the plugin as
      // code-owned; refresh the list too so ownership/badge follow through.
      refreshRouteAssociatedPlugins(route.id);
    }, PROMOTION_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, route?.id, activeKey, refreshPromotions, refreshRouteAssociatedPlugins]);

  // Ownership signal (ADR-017) for the current instance — undefined while
  // fetchInstances hasn't resolved yet or found no match, which
  // derivePromotionBadge treats the same as "no ownership gate configured".
  const instanceDefaultTags = useMemo(
    () => kongInstances.find(i => i.id === instance)?.defaultTags,
    [kongInstances, instance],
  );

  const handleToggleEnabled = useCallback(
    async (pluginId: string, _pluginName: string, nextEnabled: boolean) => {
      if (!route) return;
      setTogglingId(pluginId);
      try {
        await editRoutePlugin(route.id, pluginId, { enabled: nextEnabled });
      } finally {
        setTogglingId(null);
      }
    },
    [route, editRoutePlugin],
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

  // Edit-in-code (issue #135): opens the config form prefilled from the
  // live config of an already code-owned plugin.
  const handleOpenCodeEdit = useCallback(
    (pluginId: string, pluginName: string) => {
      const plugin = associatedPluginById.get(pluginId);
      setCodeEditTarget({ id: pluginId, name: pluginName, config: plugin?.config ?? {} });
    },
    [associatedPluginById],
  );

  const handleCloseCodeEdit = useCallback(() => {
    setCodeEditTarget(null);
  }, []);

  // The code form's submit hands us the edited config — open the same
  // review dialog the experiment flow uses, carrying both the live config
  // (for comparison) and the edited one (what actually gets previewed and
  // promoted).
  const handleSubmitCodeEdit = useCallback(
    (config: Record<string, unknown>) => {
      if (!codeEditTarget) return;
      setReviewError(null);
      setReviewPlugin({ id: codeEditTarget.id, name: codeEditTarget.name, config: codeEditTarget.config, editedConfig: config });
      setCodeEditTarget(null);
    },
    [codeEditTarget],
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
      await promotePlugin(route.id, reviewPlugin.id, entityRef, reviewPlugin.editedConfig);
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

  // Delete-in-code (issue #3): open the removal review dialog for a code-owned plugin.
  const handleOpenRemoval = useCallback((pluginId: string, pluginName: string) => {
    setRemoveError(null);
    setRemoveTarget({ id: pluginId, name: pluginName });
  }, []);

  const handleCloseRemoval = useCallback(() => {
    if (removeSubmitting) return;
    setRemoveTarget(null);
    setRemoveError(null);
  }, [removeSubmitting]);

  const handleConfirmRemoval = useCallback(async () => {
    if (!route || !removeTarget) return;
    setRemoveSubmitting(true);
    setRemoveError(null);
    try {
      await demotePlugin(route.id, removeTarget.id, entityRef);
      const removedName = removeTarget.name;
      setRemoveTarget(null);
      onRemovalOpened?.(removedName);
    } catch (e: unknown) {
      setRemoveError(e instanceof Error ? e.message : String(e));
    } finally {
      setRemoveSubmitting(false);
    }
  }, [route, removeTarget, entityRef, demotePlugin, onRemovalOpened]);

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
          <Typography color="text.secondary">
            {search
              ? t('routePluginsDrawer.noPluginsFiltered', { search })
              : t('routePluginsDrawer.noPluginsEmpty')}
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
          {cat.plugins.map(plugin => {
            const pluginId = associatedMap.get(plugin.slug);
            const assocPlugin = pluginId ? associatedPluginById.get(pluginId) : undefined;
            const promotionBadge = pluginId
              ? derivePromotionBadge(
                  promotionsByPluginId[pluginId],
                  assocPlugin?.created_at ?? 0,
                  Date.now(),
                  { pluginTags: assocPlugin?.tags, instanceDefaultTags },
                )
              : undefined;
            // Per-type gate (#136): the backend refuses types without a
            // promotion adapter with a 400; say so before the click instead.
            // A backend that does not report `adapters` (< 1.5.0) leaves the
            // button enabled — the server-side gate still holds.
            const adapters = promotionCapabilities?.adapters;
            const noAdapterReason =
              adapters && !adapters.includes(plugin.slug)
                ? t('routePluginsDrawer.noAdapterReason')
                : undefined;
            return (
              <PluginCard
                key={plugin.slug}
                plugin={plugin}
                associatedId={pluginId}
                enabled={assocPlugin?.enabled}
                canEnable={canEnable}
                canEdit={canEdit}
                canToggleEnabled={canToggleEnabled}
                togglingEnabled={togglingId === pluginId}
                onEnable={handleEnable}
                onEdit={handleEdit}
                onToggleEnabled={handleToggleEnabled}
                promotionBadge={promotionBadge}
                canPromote={canPromote}
                promoteDisabledReason={promoteDisabledReason ?? noAdapterReason}
                discardingPromotion={discardingId === pluginId}
                onPromote={handleOpenReview}
                onDiscardPromotion={handleDiscard}
                editInCodeEnabled={promotionCapabilities?.editInCode}
                onEditInCode={handleOpenCodeEdit}
                onDeleteInCode={handleOpenRemoval}
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
          <Typography variant="h5">{t('routePluginsDrawer.title', { routeLabel })}</Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>

        <Box display="flex" alignItems="center" justifyContent="flex-end" mb={2} gap={1}>
          {loading && <CircularProgress size={20} />}
          <TextField
            size="small"
            placeholder={t('routePluginsDrawer.searchPlaceholder')}
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
            <CardTab label={t('routePluginsDrawer.allPlugins')}>
              <Box p={2}>{renderCategories(allFiltered)}</Box>
            </CardTab>
            <CardTab label={t('routePluginsDrawer.associatedPlugins')}>
              <Box p={2}>{renderCategories(associatedFiltered)}</Box>
            </CardTab>
          </TabbedCard>
        </Box>
      </Box>

      <PluginConfigDrawer
        open={!!codeEditTarget}
        pluginName={codeEditTarget?.name ?? ''}
        pluginId={codeEditTarget?.id}
        existingConfig={codeEditTarget?.config}
        scope="route"
        routeId={route?.id}
        mode="code"
        onClose={handleCloseCodeEdit}
        onSubmitCode={handleSubmitCodeEdit}
      />

      <PromotionReviewDialog
        open={!!reviewPlugin}
        pluginName={reviewPlugin?.name ?? ''}
        liveConfig={reviewPlugin?.config ?? {}}
        editedConfig={reviewPlugin?.editedConfig}
        routeId={route?.id ?? null}
        pluginId={reviewPlugin?.id ?? null}
        entityRef={entityRef}
        onClose={handleCloseReview}
        onConfirm={handleConfirmPromote}
        submitting={reviewSubmitting}
        error={reviewError}
      />

      <CodeRemovalDialog
        open={!!removeTarget}
        pluginName={removeTarget?.name ?? ''}
        routeId={route?.id ?? null}
        pluginId={removeTarget?.id ?? null}
        entityRef={entityRef}
        onClose={handleCloseRemoval}
        onConfirm={handleConfirmRemoval}
        submitting={removeSubmitting}
        error={removeError}
      />
    </Drawer>
  );
}
