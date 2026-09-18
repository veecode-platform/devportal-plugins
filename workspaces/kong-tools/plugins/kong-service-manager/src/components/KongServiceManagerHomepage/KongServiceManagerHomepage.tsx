import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Snackbar, Tab, Tabs, Button, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useEntityAnnotations, useKongPermissions } from '../../hooks';
import { useTranslation } from '../../hooks/useTranslation';
import { useKongServiceManager } from '../../context/KongServiceManagerContext';
import { SelectInstance } from '../SelectInstance/SelectInstance';
import { ServicePage } from '../ServicePage/ServicePage';
import { PluginsList } from '../PluginsList/PluginsList';
import { PluginConfigDrawer } from '../PluginConfigDrawer/PluginConfigDrawer';
import { RoutesList } from '../RoutesList/RoutesList';
import { RouteForm } from '../RouteForm/RouteForm';
import { RoutePluginsDrawer } from '../RoutePluginsDrawer';
import type { RouteResponse } from '@veecode-platform/backstage-plugin-kong-service-manager-common';

export function KongServiceManagerHomepage() {
  const { t } = useTranslation();
  const { serviceName } = useEntityAnnotations();
  const { state, setServiceName } = useKongServiceManager();
  const permissions = useKongPermissions();
  const [tabIndex, setTabIndex] = useState(0);

  // Plugin drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerPluginName, setDrawerPluginName] = useState('');
  const [drawerPluginId, setDrawerPluginId] = useState<string | undefined>();
  const [drawerConfig, setDrawerConfig] = useState<Record<string, unknown> | undefined>();
  const [drawerEnabled, setDrawerEnabled] = useState<boolean | undefined>();
  const [drawerScope, setDrawerScope] = useState<'service' | 'route'>('service');
  const [drawerRouteId, setDrawerRouteId] = useState<string | undefined>();

  // Route form state
  const [routeFormOpen, setRouteFormOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState<RouteResponse | undefined>();

  // Route plugins drawer state
  const [routePluginsRoute, setRoutePluginsRoute] = useState<RouteResponse | null>(null);

  // Snackbar state
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (serviceName) {
      setServiceName(serviceName);
    }
  }, [serviceName, setServiceName]);

  const handleEnablePlugin = useCallback((pluginSlug: string) => {
    setDrawerPluginId(undefined);
    setDrawerPluginName(pluginSlug);
    setDrawerConfig(undefined);
    setDrawerEnabled(undefined);
    setDrawerScope('service');
    setDrawerRouteId(undefined);
    setDrawerOpen(true);
  }, []);

  const handleEditPlugin = useCallback((pluginId: string, pluginName: string) => {
    // Edit must open on the plugin's live config/enabled, not schema defaults —
    // the associated-plugins list already carries both.
    const existing = state.associatedPlugins.find(p => p.id === pluginId);
    setDrawerPluginId(pluginId);
    setDrawerPluginName(pluginName);
    setDrawerConfig(existing?.config);
    setDrawerEnabled(existing?.enabled);
    setDrawerScope('service');
    setDrawerRouteId(undefined);
    setDrawerOpen(true);
  }, [state.associatedPlugins]);

  const handleManageRoutePlugins = useCallback((route: RouteResponse) => {
    setRoutePluginsRoute(route);
  }, []);

  const handleEnableRoutePlugin = useCallback((routeId: string, pluginSlug: string) => {
    setDrawerPluginId(undefined);
    setDrawerPluginName(pluginSlug);
    setDrawerConfig(undefined);
    setDrawerEnabled(undefined);
    setDrawerScope('route');
    setDrawerRouteId(routeId);
    setDrawerOpen(true);
  }, []);

  const handleEditRoutePlugin = useCallback((routeId: string, pluginId: string, pluginName: string) => {
    // The route-plugins drawer has already fetched this route's associated
    // plugins into state, so its live config/enabled are available here.
    const existing = state.routeAssociatedPlugins.find(p => p.id === pluginId);
    setDrawerPluginId(pluginId);
    setDrawerPluginName(pluginName);
    setDrawerConfig(existing?.config);
    setDrawerEnabled(existing?.enabled);
    setDrawerScope('route');
    setDrawerRouteId(routeId);
    setDrawerOpen(true);
  }, [state.routeAssociatedPlugins]);

  const handleEditRoute = useCallback((route: RouteResponse) => {
    setEditingRoute(route);
    setRouteFormOpen(true);
  }, []);

  const handleCreateRoute = useCallback(() => {
    setEditingRoute(undefined);
    setRouteFormOpen(true);
  }, []);

  return (
    <Box>
      <SelectInstance />

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('homepage.intro')}
      </Typography>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        {/* textTransform none = same casing as the RHDH entity tabs above */}
        <Tabs value={tabIndex} onChange={(_, v) => setTabIndex(v)}>
          <Tab label={t('homepage.tabs.service')} sx={{ textTransform: 'none' }} />
          <Tab label={t('homepage.tabs.plugins')} sx={{ textTransform: 'none' }} />
          <Tab label={t('homepage.tabs.routes')} sx={{ textTransform: 'none' }} />
        </Tabs>
      </Box>

      {tabIndex === 0 && <ServicePage />}

      {tabIndex === 1 && (
        <Box>
          <Alert severity="info" sx={{ mb: 2 }}>
            {t('homepage.pluginsScope')}
          </Alert>
          <PluginsList
            onEnablePlugin={handleEnablePlugin}
            onEditPlugin={handleEditPlugin}
            onPluginToggled={(name, enabled) =>
              setSuccessMessage(
                t(enabled ? 'homepage.pluginEnabled' : 'homepage.pluginDisabled', { name }),
              )
            }
            canEnable={permissions.canAddServicePlugin}
            canToggleEnabled={permissions.canUpdateServicePlugin}
            canEdit={permissions.canUpdateServicePlugin}
          />
        </Box>
      )}

      {tabIndex === 2 && (
        <Box>
          <Alert severity="info" sx={{ mb: 2 }}>
            {t('homepage.routesScope')}
          </Alert>
          {permissions.canCreateRoute && (
            <Box display="flex" justifyContent="flex-end" mb={1}>
              <Button
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={handleCreateRoute}
                size="small"
              >
                {t('homepage.createRoute')}
              </Button>
            </Box>
          )}
          <RoutesList
            onEditRoute={handleEditRoute}
            onManagePlugins={handleManageRoutePlugins}
            onRouteDeleted={() => setSuccessMessage(t('homepage.routeDeleted'))}
            canEdit={permissions.canUpdateRoute}
            canDelete={permissions.canDeleteRoute}
          />
        </Box>
      )}

      <RoutePluginsDrawer
        open={!!routePluginsRoute}
        route={routePluginsRoute}
        onClose={() => setRoutePluginsRoute(null)}
        onEnablePlugin={handleEnableRoutePlugin}
        onEditPlugin={handleEditRoutePlugin}
        canEnable={permissions.canAddRoutePlugin}
        canToggleEnabled={permissions.canUpdateRoutePlugin}
        canEdit={permissions.canUpdateRoutePlugin}
        canPromote={permissions.canPromotePlugin}
        onPromoted={name => setSuccessMessage(t('homepage.pluginPromotionOpened', { name }))}
        onPromotionDiscarded={name => setSuccessMessage(t('homepage.promotionDiscarded', { name }))}
        onRemovalOpened={name => setSuccessMessage(t('homepage.pluginRemovalOpened', { name }))}
      />

      <PluginConfigDrawer
        open={drawerOpen}
        pluginName={drawerPluginName}
        pluginId={drawerPluginId}
        existingConfig={drawerConfig}
        existingEnabled={drawerEnabled}
        scope={drawerScope}
        routeId={drawerRouteId}
        onClose={() => setDrawerOpen(false)}
        onSaved={() =>
          setSuccessMessage(
            drawerPluginId
              ? t('homepage.pluginUpdated', { name: drawerPluginName })
              : t('homepage.pluginEnabled', { name: drawerPluginName }),
          )
        }
      />

      <RouteForm
        key={editingRoute?.id ?? 'new'}
        open={routeFormOpen}
        onClose={() => setRouteFormOpen(false)}
        onSaved={() =>
          setSuccessMessage(
            editingRoute ? t('homepage.routeUpdated') : t('homepage.routeCreated'),
          )
        }
        editingRoute={editingRoute}
      />

      <Snackbar
        open={!!state.error}
        autoHideDuration={6000}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="error" variant="filled">
          {state.error}
        </Alert>
      </Snackbar>

      <Snackbar
        open={!!successMessage}
        autoHideDuration={4000}
        onClose={() => setSuccessMessage(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" variant="filled" onClose={() => setSuccessMessage(null)}>
          {successMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
}
