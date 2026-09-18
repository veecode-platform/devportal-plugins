import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Drawer,
  FormControl,
  FormControlLabel,
  IconButton,
  MenuItem,
  Skeleton,
  TextField,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useKongServiceManager } from '../../context/KongServiceManagerContext';
import { useTranslation } from '../../hooks/useTranslation';
import { getPluginImage } from '../../assets/pluginImages';
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
  /** Current `enabled` flag of the plugin being edited (kong mode). Undefined for a new plugin → defaults to enabled. Ignored in code mode, where `enabled` isn't part of the submit. */
  existingEnabled?: boolean;
  scope: 'service' | 'route';
  routeId?: string;
  onClose: () => void;
  onSaved?: () => void;
  /**
   * `'code'` (issue #135, "edit in code") replaces the Kong mutation on
   * submit with `onSubmitCode` — used to edit an already code-owned plugin
   * by opening a merge request, never by calling Kong. @default 'kong'
   */
  mode?: 'kong' | 'code';
  /** Required when `mode: 'code'` — receives the edited `config` (the `enabled` flag is not part of a code-mode submit; the adapter only consumes `config`). */
  onSubmitCode?: (config: Record<string, unknown>) => void;
};

export function PluginConfigDrawer({
  open,
  pluginName,
  pluginId,
  existingConfig,
  existingEnabled,
  scope,
  routeId,
  onClose,
  onSaved,
  mode = 'kong',
  onSubmitCode,
}: PluginConfigDrawerProps) {
  const { t } = useTranslation();
  const {
    state,
    clearError,
    fetchPluginFields,
    addPluginToService,
    editServicePlugin,
    addPluginToRoute,
    editRoutePlugin,
  } = useKongServiceManager();

  const [configState, setConfigState] = useState<Record<string, unknown>>({});
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Key of the plugin whose form we've already seeded this open. Guards the
  // seeding effect so it runs once per (plugin, open) instead of on every
  // parent re-render — the parent hands a fresh `existingConfig` object each
  // time, which would otherwise re-seed and wipe the user's in-progress edits.
  const seededKeyRef = useRef<string | null>(null);

  // Parse schema into config fields
  const configFields: ConfigField[] = useMemo(() => {
    const fieldsKey = `${state.instance}:${pluginName}`;
    if (!state.pluginFields || state.pluginFieldsKey !== fieldsKey) return [];
    return parseConfigFields(state.pluginFields);
  }, [state.instance, state.pluginFields, state.pluginFieldsKey, pluginName]);

  // Fetch schema and seed form state when drawer opens
  useEffect(() => {
    if (open && pluginName) {
      setSaveError(null);
      fetchPluginFields(pluginName);
    }
  }, [open, pluginName, fetchPluginFields]);

  // Seed config state from schema defaults + existing config. Runs once per
  // (plugin, open): the guard below keeps a fresh `existingConfig` identity on
  // a parent re-render from re-seeding over the user's edits, and the reset on
  // close lets the next open seed again.
  useEffect(() => {
    if (!open) {
      seededKeyRef.current = null;
      return;
    }
    if (configFields.length === 0) return;

    const key = `${state.instance}:${pluginName}:${pluginId ?? 'new'}`;
    if (seededKeyRef.current === key) return;

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
    // Reflect the plugin's real enabled state on edit; a new plugin (or a
    // code-mode submit, where `enabled` is not part of the payload) defaults on.
    setEnabled(mode === 'kong' ? existingEnabled ?? true : true);
    seededKeyRef.current = key;
  }, [
    open,
    configFields,
    existingConfig,
    existingEnabled,
    pluginName,
    pluginId,
    mode,
    state.instance,
  ]);

  const handleFieldChange = useCallback(
    (fieldName: string, value: unknown) => {
      setConfigState(prev => ({ ...prev, [fieldName]: value }));
    },
    [],
  );

  const handleSave = useCallback(async () => {
    if (mode === 'code') {
      // Edit-in-code (issue #135) never calls Kong — the config goes to the
      // review dialog, which previews and promotes it as a merge request.
      onSubmitCode?.(configState);
      onClose();
      return;
    }

    setSaving(true);
    setSaveError(null);
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
      onSaved?.();
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : String(e));
      clearError();
    } finally {
      setSaving(false);
    }
  }, [
    mode,
    onSubmitCode,
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
    onSaved,
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
            <Box
              component="img"
              src={getPluginImage(pluginName)}
              alt={pluginName}
              sx={{ width: 50, height: 50, borderRadius: '4px', objectFit: 'contain' }}
            />
            <Typography variant="h5">{t('pluginConfigDrawer.title', { pluginName })}</Typography>
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
            <Box display="flex" flexDirection="column" gap={1.5} py={1}>
              <Skeleton variant="rectangular" height={40} sx={{ borderRadius: 1 }} />
              <Skeleton variant="rectangular" height={56} sx={{ borderRadius: 1 }} />
              <Skeleton variant="rectangular" height={56} sx={{ borderRadius: 1 }} />
              <Skeleton variant="rectangular" height={56} sx={{ borderRadius: 1 }} />
              <Skeleton variant="rectangular" height={40} sx={{ borderRadius: 1 }} />
            </Box>
          ) : configFields.length === 0 ? (
            <Typography color="text.secondary" textAlign="center" py={4}>
              {t('pluginConfigDrawer.noConfigurableFields')}
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
                label={t('pluginConfigDrawer.enabled')}
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
                        value={value ?? ''}
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
                        value={value ?? ''}
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

        {saveError && (
          <Alert severity="error" sx={{ mt: 2 }} onClose={() => setSaveError(null)}>
            {saveError}
          </Alert>
        )}

        {/* Footer actions */}
        <Box display="flex" gap={1.5} justifyContent="flex-end" mt={2}>
          <Button variant="outlined" onClick={onClose}>
            {t('pluginConfigDrawer.cancel')}
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <>
                {isEdit ? t('pluginConfigDrawer.saving') : t('pluginConfigDrawer.installing')}
                <CircularProgress size={18} sx={{ ml: 1 }} />
              </>
            ) : mode === 'code' ? (
              t('pluginConfigDrawer.reviewPromotion')
            ) : isEdit ? (
              t('pluginConfigDrawer.saveChanges')
            ) : (
              t('pluginConfigDrawer.installPlugin')
            )}
          </Button>
        </Box>
      </Box>
    </Drawer>
  );
}
