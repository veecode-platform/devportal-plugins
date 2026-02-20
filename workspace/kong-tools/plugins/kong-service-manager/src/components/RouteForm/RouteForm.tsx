import { useState } from 'react';
import {
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

const METHODS: HttpMethod[] = [
  'GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS',
];

const PROTOCOLS: RouteProtocol[] = [
  'http', 'https', 'tcp', 'tls', 'tls_passthrough', 'ws', 'wss', 'grpc', 'grpcs',
];

type RouteFormProps = {
  open: boolean;
  onClose: () => void;
  editingRoute?: RouteResponse;
};

export function RouteForm({ open, onClose, editingRoute }: RouteFormProps) {
  const { createRoute, editRoute } = useKongServiceManager();
  const [saving, setSaving] = useState(false);

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
        {editingRoute ? 'Edit Route' : 'Create Route'}
      </DialogTitle>
      <DialogContent>
        <Box display="flex" flexDirection="column" gap={2} mt={1}>
          <TextField
            label="Name"
            value={name}
            onChange={e => setName(e.target.value)}
            fullWidth
            size="small"
          />

          <FormControl fullWidth size="small">
            <InputLabel>Protocols</InputLabel>
            <Select
              multiple
              value={protocols}
              onChange={handleMultiSelect(setProtocols)}
              input={<OutlinedInput label="Protocols" />}
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
            <InputLabel>Methods</InputLabel>
            <Select
              multiple
              value={methods}
              onChange={handleMultiSelect(setMethods)}
              input={<OutlinedInput label="Methods" />}
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
            label="Paths (comma-separated)"
            value={paths}
            onChange={e => setPaths(e.target.value)}
            fullWidth
            size="small"
            helperText="e.g. /api/v1, /health"
          />

          <TextField
            label="Hosts (comma-separated)"
            value={hosts}
            onChange={e => setHosts(e.target.value)}
            fullWidth
            size="small"
            helperText="Optional, e.g. example.com"
          />

          <FormControlLabel
            control={
              <Switch
                checked={stripPath}
                onChange={e => setStripPath(e.target.checked)}
              />
            }
            label="Strip Path"
          />

          <FormControlLabel
            control={
              <Switch
                checked={preserveHost}
                onChange={e => setPreserveHost(e.target.checked)}
              />
            }
            label="Preserve Host"
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
