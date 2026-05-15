import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Snackbar, Tab, Tabs, Button } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useEntityAnnotations, useKongPermissions } from '../../hooks';
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
  const { serviceName } = useEntityAnnotations();
  const { state, setServiceName } = useKongServiceManager();
  const permissions = useKongPermissions();
  const [tabIndex, setTabIndex] = useState(0);

  // Plugin drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerPluginName, setDrawerPluginName] = useState('');
  const [drawerPluginId, setDrawerPluginId] = useState<string | undefined>();
  const [drawerConfig, setDrawerConfig] = useState<Record<string, unknown> | undefined>();
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
    setDrawerScope('service');
    setDrawerRouteId(undefined);
    setDrawerOpen(true);
  }, []);

  const handleEditPlugin = useCallback((pluginId: string, pluginName: string) => {
    setDrawerPluginId(pluginId);
    setDrawerPluginName(pluginName);
    setDrawerConfig(undefined);
    setDrawerScope('service');
    setDrawerRouteId(undefined);
    setDrawerOpen(true);
  }, []);

  const handleManageRoutePlugins = useCallback((route: RouteResponse) => {
    setRoutePluginsRoute(route);
  }, []);

  const handleEnableRoutePlugin = useCallback((routeId: string, pluginSlug: string) => {
    setDrawerPluginId(undefined);
    setDrawerPluginName(pluginSlug);
    setDrawerConfig(undefined);
    setDrawerScope('route');
    setDrawerRouteId(routeId);
    setDrawerOpen(true);
  }, []);

  const handleEditRoutePlugin = useCallback((routeId: string, pluginId: string, pluginName: string) => {
    setDrawerPluginId(pluginId);
    setDrawerPluginName(pluginName);
    setDrawerConfig(undefined);
    setDrawerScope('route');
    setDrawerRouteId(routeId);
    setDrawerOpen(true);
  }, []);

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

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs value={tabIndex} onChange={(_, v) => setTabIndex(v)}>
          <Tab label="Service" />
          <Tab label="Plugins" />
          <Tab label="Routes" />
        </Tabs>
      </Box>

      {tabIndex === 0 && <ServicePage />}

      {tabIndex === 1 && (
        <PluginsList
          onEnablePlugin={handleEnablePlugin}
          onEditPlugin={handleEditPlugin}
          onPluginDisabled={name => setSuccessMessage(`Plugin "${name}" disabled`)}
          canEnable={permissions.canAddServicePlugin}
          canDisable={permissions.canDisableServicePlugin}
          canEdit={permissions.canUpdateServicePlugin}
        />
      )}

      {tabIndex === 2 && (
        <Box>
          {permissions.canCreateRoute && (
            <Box display="flex" justifyContent="flex-end" mb={1}>
              <Button
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={handleCreateRoute}
                size="small"
              >
                Create Route
              </Button>
            </Box>
          )}
          <RoutesList
            onEditRoute={handleEditRoute}
            onManagePlugins={handleManageRoutePlugins}
            onRouteDeleted={() => setSuccessMessage('Route deleted')}
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
        canDisable={permissions.canDisableRoutePlugin}
        canEdit={permissions.canUpdateRoutePlugin}
      />

      <PluginConfigDrawer
        open={drawerOpen}
        pluginName={drawerPluginName}
        pluginId={drawerPluginId}
        existingConfig={drawerConfig}
        scope={drawerScope}
        routeId={drawerRouteId}
        onClose={() => setDrawerOpen(false)}
        onSaved={() =>
          setSuccessMessage(
            drawerPluginId
              ? `Plugin "${drawerPluginName}" updated`
              : `Plugin "${drawerPluginName}" enabled`,
          )
        }
      />

      <RouteForm
        key={editingRoute?.id ?? 'new'}
        open={routeFormOpen}
        onClose={() => setRouteFormOpen(false)}
        onSaved={() =>
          setSuccessMessage(
            editingRoute ? 'Route updated' : 'Route created',
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
