import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  OutlinedInput,
  Select,
  Switch,
  FormControlLabel,
  TextField,
  type SelectChangeEvent,
} from '@mui/material';
import type {
  CreateRoute,
  RouteResponse,
  HttpMethod,
  RouteProtocol,
} from '@veecode-platform/backstage-plugin-kong-service-manager-common';
import { useKongServiceManager } from '../../context/KongServiceManagerContext';
import { useTranslation } from '../../hooks/useTranslation';

const METHODS: HttpMethod[] = [
  'GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS',
];

const PROTOCOLS: RouteProtocol[] = [
  'http', 'https', 'tcp', 'tls', 'tls_passthrough', 'ws', 'wss', 'grpc', 'grpcs',
];

type RouteFormProps = {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  editingRoute?: RouteResponse;
};

export function RouteForm({ open, onClose, onSaved, editingRoute }: RouteFormProps) {
  const { t } = useTranslation();
  const { createRoute, editRoute, clearError } = useKongServiceManager();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [name, setName] = useState(editingRoute?.name ?? '');
  const [protocols, setProtocols] = useState<string[]>(
    editingRoute?.protocols ?? ['http', 'https'],
  );
  const [methods, setMethods] = useState<string[]>(
    editingRoute?.methods ?? ['GET'],
  );
  const [paths, setPaths] = useState(editingRoute?.paths?.join(', ') ?? '/');
  const [hosts, setHosts] = useState(editingRoute?.hosts?.join(', ') ?? '');
  const [stripPath, setStripPath] = useState(editingRoute?.strip_path ?? true);
  const [preserveHost, setPreserveHost] = useState(
    editingRoute?.preserve_host ?? false,
  );

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const route: CreateRoute = {
        name: name || undefined,
        protocols: protocols as RouteProtocol[],
        methods: methods as HttpMethod[],
        paths: paths
          .split(',')
          .map(p => p.trim())
          .filter(Boolean),
        hosts: hosts
          ? hosts.split(',').map(h => h.trim()).filter(Boolean)
          : undefined,
        strip_path: stripPath,
        preserve_host: preserveHost,
      };

      if (editingRoute) {
        await editRoute(editingRoute.id, route);
      } else {
        await createRoute(route);
      }
      onClose();
      onSaved?.();
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : String(e));
      clearError();
    } finally {
      setSaving(false);
    }
  };

  const handleMultiSelect = (setter: (v: string[]) => void) =>
    (event: SelectChangeEvent<string[]>) => {
      const val = event.target.value;
      setter(typeof val === 'string' ? val.split(',') : val);
    };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {editingRoute ? t('routeForm.editTitle') : t('routeForm.createTitle')}
      </DialogTitle>
      <DialogContent>
        <Box display="flex" flexDirection="column" gap={2} mt={1}>
          <TextField
            label={t('routeForm.nameLabel')}
            value={name}
            onChange={e => setName(e.target.value)}
            fullWidth
            size="small"
          />

          <FormControl fullWidth size="small">
            <InputLabel>{t('routeForm.protocolsLabel')}</InputLabel>
            <Select
              multiple
              value={protocols}
              onChange={handleMultiSelect(setProtocols)}
              input={<OutlinedInput label={t('routeForm.protocolsLabel')} />}
              renderValue={selected => (
                <Box display="flex" gap={0.5} flexWrap="wrap">
                  {(selected as string[]).map(v => (
                    <Chip key={v} label={v} size="small" />
                  ))}
                </Box>
              )}
            >
              {PROTOCOLS.map(p => (
                <MenuItem key={p} value={p}>{p}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl fullWidth size="small">
            <InputLabel>{t('routeForm.methodsLabel')}</InputLabel>
            <Select
              multiple
              value={methods}
              onChange={handleMultiSelect(setMethods)}
              input={<OutlinedInput label={t('routeForm.methodsLabel')} />}
              renderValue={selected => (
                <Box display="flex" gap={0.5} flexWrap="wrap">
                  {(selected as string[]).map(v => (
                    <Chip key={v} label={v} size="small" />
                  ))}
                </Box>
              )}
            >
              {METHODS.map(m => (
                <MenuItem key={m} value={m}>{m}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            label={t('routeForm.pathsLabel')}
            value={paths}
            onChange={e => setPaths(e.target.value)}
            fullWidth
            size="small"
            helperText={t('routeForm.pathsHelper')}
          />

          <TextField
            label={t('routeForm.hostsLabel')}
            value={hosts}
            onChange={e => setHosts(e.target.value)}
            fullWidth
            size="small"
            helperText={t('routeForm.hostsHelper')}
          />

          <FormControlLabel
            control={
              <Switch
                checked={stripPath}
                onChange={e => setStripPath(e.target.checked)}
              />
            }
            label={t('routeForm.stripPath')}
          />

          <FormControlLabel
            control={
              <Switch
                checked={preserveHost}
                onChange={e => setPreserveHost(e.target.checked)}
              />
            }
            label={t('routeForm.preserveHost')}
          />
        </Box>
        {saveError && (
          <Alert severity="error" sx={{ mt: 2 }} onClose={() => setSaveError(null)}>
            {saveError}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('routeForm.cancel')}</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          {saving ? t('routeForm.saving') : t('routeForm.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
