import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Drawer,
  FormControl,
  FormControlLabel,
  IconButton,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ExtensionIcon from '@mui/icons-material/Extension';
import { useKongServiceManager } from '../../context/KongServiceManagerContext';
import type { CreatePlugin } from '@veecode-platform/backstage-plugin-kong-service-manager-common';
import {
  parseConfigFields,
  type ConfigField,
  IncrementalFields,
  RecordFields,
} from './fields';

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

  const [configState, setConfigState] = useState<Record<string, unknown>>({});
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  // Parse schema into config fields
  const configFields: ConfigField[] = useMemo(() => {
    if (!state.pluginFields) return [];
    return parseConfigFields(state.pluginFields);
  }, [state.pluginFields]);

  // Fetch schema and seed form state when drawer opens
  useEffect(() => {
    if (open && pluginName) {
      fetchPluginFields(pluginName);
    }
  }, [open, pluginName, fetchPluginFields]);

  // Seed config state from schema defaults + existing config
  useEffect(() => {
    if (!open || configFields.length === 0) return;

    const seeded: Record<string, unknown> = {};
    for (const field of configFields) {
      if (field.defaultValue !== undefined) {
        seeded[field.name] = field.defaultValue;
      }
    }

    // Overlay existing config values (for edit mode)
    if (existingConfig) {
      for (const field of configFields) {
        if (existingConfig[field.name] !== undefined && existingConfig[field.name] !== null) {
          seeded[field.name] = existingConfig[field.name];
        }
      }
    }

    setConfigState(seeded);
    setEnabled(true);
  }, [open, configFields, existingConfig]);

  const handleFieldChange = useCallback(
    (fieldName: string, value: unknown) => {
      setConfigState(prev => ({ ...prev, [fieldName]: value }));
    },
    [],
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const plugin: CreatePlugin = {
        name: pluginName,
        config: configState,
        enabled,
      };

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
    configState,
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

  const isEdit = !!pluginId;
  const isLoading = state.loading && configFields.length === 0;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: '50%', minWidth: 400, maxWidth: 720 } }}
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          p: 2.5,
        }}
      >
        {/* Header */}
        <Box
          display="flex"
          justifyContent="space-between"
          alignItems="center"
          mb={2}
        >
          <Box display="flex" alignItems="center" gap={2}>
            <ExtensionIcon sx={{ fontSize: 40, color: 'primary.main' }} />
            <Typography variant="h5">{pluginName} Plugin</Typography>
          </Box>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>

        {/* Form body */}
        <Box
          sx={{
            flexGrow: 1,
            overflow: 'auto',
            bgcolor: 'background.paper',
            p: 2,
            borderRadius: 1,
          }}
        >
          {isLoading ? (
            <Box display="flex" justifyContent="center" py={4}>
              <CircularProgress />
            </Box>
          ) : configFields.length === 0 ? (
            <Typography color="text.secondary" textAlign="center" py={4}>
              No configurable fields for this plugin.
            </Typography>
          ) : (
            <FormControl
              component="fieldset"
              sx={{
                display: 'flex',
                flexDirection: 'column',
                width: '100%',
              }}
            >
              <FormControlLabel
                control={
                  <Checkbox
                    checked={enabled}
                    onChange={e => setEnabled(e.target.checked)}
                    color="primary"
                  />
                }
                label="Enabled"
                sx={{ mb: 2 }}
              />

              {configFields.map(field => {
                const value = configState[field.name];

                switch (field.type) {
                  case 'string':
                    if (field.oneOf && field.oneOf.length > 0) {
                      return (
                        <TextField
                          key={field.name}
                          select
                          label={`config.${field.name}`}
                          variant="outlined"
                          fullWidth
                          required={field.required}
                          value={value ?? ''}
                          onChange={e =>
                            handleFieldChange(field.name, e.target.value)
                          }
                          sx={{ mb: 1.5 }}
                        >
                          {field.oneOf.map(opt => (
                            <MenuItem key={String(opt)} value={String(opt)}>
                              {String(opt)}
                            </MenuItem>
                          ))}
                        </TextField>
                      );
                    }
                    return (
                      <TextField
                        key={field.name}
                        label={`config.${field.name}`}
                        variant="outlined"
                        fullWidth
                        required={field.required}
                        defaultValue={value ?? ''}
                        onChange={e =>
                          handleFieldChange(field.name, e.target.value)
                        }
                        sx={{ mb: 1.5 }}
                      />
                    );

                  case 'number':
                    return (
                      <TextField
                        key={field.name}
                        type="number"
                        label={`config.${field.name}`}
                        variant="outlined"
                        fullWidth
                        required={field.required}
                        defaultValue={value ?? ''}
                        onChange={e =>
                          handleFieldChange(field.name, Number(e.target.value))
                        }
                        sx={{ mb: 1.5 }}
                      />
                    );

                  case 'boolean':
                    return (
                      <FormControlLabel
                        key={field.name}
                        label={`config.${field.name}`}
                        labelPlacement="end"
                        control={
                          <Checkbox
                            color="primary"
                            required={field.required}
                            checked={!!value}
                            onChange={e =>
                              handleFieldChange(field.name, e.target.checked)
                            }
                          />
                        }
                        sx={{ mb: 1.5, width: '100%' }}
                      />
                    );

                  case 'array':
                    if (field.arrayElementType === 'record' && field.recordFields) {
                      return (
                        <RecordFields
                          key={field.name}
                          name={field.name}
                          required={field.required}
                          items={Array.isArray(value) ? (value as Record<string, unknown>[]) : []}
                          recordFields={field.recordFields}
                          onChange={vals => handleFieldChange(field.name, vals)}
                        />
                      );
                    }
                    // Default: array of strings
                    return (
                      <IncrementalFields
                        key={field.name}
                        name={field.name}
                        required={field.required}
                        items={Array.isArray(value) ? (value as string[]) : []}
                        onChange={vals => handleFieldChange(field.name, vals)}
                      />
                    );

                  default:
                    return null;
                }
              })}
            </FormControl>
          )}
        </Box>

        {/* Footer actions */}
        <Box display="flex" gap={1.5} justifyContent="flex-end" mt={2}>
          <Button variant="outlined" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <>
                {isEdit ? 'Saving...' : 'Installing...'}
                <CircularProgress size={18} sx={{ ml: 1 }} />
              </>
            ) : isEdit ? (
              'Save Changes'
            ) : (
              'Install Plugin'
            )}
          </Button>
        </Box>
      </Box>
    </Drawer>
  );
}
