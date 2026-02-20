import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Drawer,
  IconButton,
  TextField,
  Typography,
  Switch,
  FormControlLabel,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useKongServiceManager } from '../../context/KongServiceManagerContext';
import type { CreatePlugin } from '@veecode-platform/backstage-plugin-kong-service-manager-common';

type PluginConfigDrawerProps = {
  open: boolean;
  pluginName: string;
  pluginId?: string;
  existingConfig?: Record<string, unknown>;
  scope: 'service' | 'route';
  routeId?: string;
  onClose: () => void;
};

export function PluginConfigDrawer({
  open,
  pluginName,
  pluginId,
  existingConfig,
  scope,
  routeId,
  onClose,
}: PluginConfigDrawerProps) {
  const {
    state,
    fetchPluginFields,
    addPluginToService,
    editServicePlugin,
    addPluginToRoute,
    editRoutePlugin,
  } = useKongServiceManager();
  const [configJson, setConfigJson] = useState('{}');
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && pluginName) {
      fetchPluginFields(pluginName);
      if (existingConfig) {
        setConfigJson(JSON.stringify(existingConfig, null, 2));
        setEnabled(true);
      } else {
        setConfigJson('{}');
        setEnabled(true);
      }
    }
  }, [open, pluginName, existingConfig, fetchPluginFields]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      let config: Record<string, unknown>;
      try {
        config = JSON.parse(configJson);
      } catch {
        throw new Error('Invalid JSON in config');
      }

      const plugin: CreatePlugin = { name: pluginName, config, enabled };

      if (scope === 'service') {
        if (pluginId) {
          await editServicePlugin(pluginId, plugin);
        } else {
          await addPluginToService(plugin);
        }
      } else if (scope === 'route' && routeId) {
        if (pluginId) {
          await editRoutePlugin(routeId, pluginId, plugin);
        } else {
          await addPluginToRoute(routeId, plugin);
        }
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }, [
    configJson,
    enabled,
    pluginName,
    pluginId,
    scope,
    routeId,
    addPluginToService,
    editServicePlugin,
    addPluginToRoute,
    editRoutePlugin,
    onClose,
  ]);

  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Box sx={{ width: 480, p: 3 }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h6">
            {pluginId ? 'Edit' : 'Add'} Plugin: {pluginName}
          </Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>

        {state.loading && !state.pluginFields ? (
          <CircularProgress />
        ) : (
          <>
            {state.pluginFields && (
              <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
                {state.pluginFields.fields.length} field(s) available
              </Typography>
            )}

            <FormControlLabel
              control={
                <Switch
                  checked={enabled}
                  onChange={e => setEnabled(e.target.checked)}
                />
              }
              label="Enabled"
              sx={{ mb: 2 }}
            />

            <TextField
              label="Plugin Configuration (JSON)"
              multiline
              rows={16}
              fullWidth
              value={configJson}
              onChange={e => setConfigJson(e.target.value)}
              sx={{ fontFamily: 'monospace', mb: 2 }}
              InputProps={{
                sx: { fontFamily: 'monospace', fontSize: '0.85rem' },
              }}
            />

            <Box display="flex" gap={1} justifyContent="flex-end">
              <Button onClick={onClose}>Cancel</Button>
              <Button
                variant="contained"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </Box>
          </>
        )}
      </Box>
    </Drawer>
  );
}
