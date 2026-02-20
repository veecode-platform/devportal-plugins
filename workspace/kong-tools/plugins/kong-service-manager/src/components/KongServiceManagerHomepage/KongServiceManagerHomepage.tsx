import { useCallback, useEffect, useState } from 'react';
import { Box, Tab, Tabs, Button } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useEntityAnnotations } from '../../hooks';
import { useKongServiceManager } from '../../context/KongServiceManagerContext';
import { SelectInstance } from '../SelectInstance/SelectInstance';
import { ServicePage } from '../ServicePage/ServicePage';
import { PluginsList } from '../PluginsList/PluginsList';
import { PluginConfigDrawer } from '../PluginConfigDrawer/PluginConfigDrawer';
import { RoutesList } from '../RoutesList/RoutesList';
import { RouteForm } from '../RouteForm/RouteForm';
import type { RouteResponse } from '@veecode-platform/backstage-plugin-kong-service-manager-common';

export function KongServiceManagerHomepage() {
  const { serviceName } = useEntityAnnotations();
  const { setServiceName } = useKongServiceManager();
  const [tabIndex, setTabIndex] = useState(0);

  // Plugin drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerPluginName, setDrawerPluginName] = useState('');
  const [drawerPluginId, setDrawerPluginId] = useState<string | undefined>();
  const [drawerConfig, setDrawerConfig] = useState<Record<string, unknown> | undefined>();

  // Route form state
  const [routeFormOpen, setRouteFormOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState<RouteResponse | undefined>();

  useEffect(() => {
    if (serviceName) {
      setServiceName(serviceName);
    }
  }, [serviceName, setServiceName]);

  const handleEditPlugin = useCallback((pluginId: string, pluginName: string) => {
    setDrawerPluginId(pluginId);
    setDrawerPluginName(pluginName);
    setDrawerConfig(undefined);
    setDrawerOpen(true);
  }, []);

  const handleRemovePlugin = useCallback((_pluginId: string, _pluginName: string) => {
    // handled by PluginsList internally via context
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
          onEditPlugin={handleEditPlugin}
          onRemovePlugin={handleRemovePlugin}
        />
      )}

      {tabIndex === 2 && (
        <Box>
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
          <RoutesList onEditRoute={handleEditRoute} />
        </Box>
      )}

      <PluginConfigDrawer
        open={drawerOpen}
        pluginName={drawerPluginName}
        pluginId={drawerPluginId}
        existingConfig={drawerConfig}
        scope="service"
        onClose={() => setDrawerOpen(false)}
      />

      <RouteForm
        open={routeFormOpen}
        onClose={() => setRouteFormOpen(false)}
        editingRoute={editingRoute}
      />
    </Box>
  );
}
