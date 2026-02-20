import { useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Chip,
  CircularProgress,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  IconButton,
  Tooltip,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { useKongServiceManager } from '../../context/KongServiceManagerContext';

type PluginsListProps = {
  onEditPlugin?: (pluginId: string, pluginName: string) => void;
  onRemovePlugin?: (pluginId: string, pluginName: string) => void;
};

export function PluginsList({ onEditPlugin, onRemovePlugin }: PluginsListProps) {
  const { state, fetchAssociatedPlugins } = useKongServiceManager();
  const { associatedPlugins, loading, error, instance, serviceName } = state;

  useEffect(() => {
    if (instance && serviceName) {
      fetchAssociatedPlugins();
    }
  }, [instance, serviceName, fetchAssociatedPlugins]);

  if (loading && associatedPlugins.length === 0) {
    return (
      <Box display="flex" justifyContent="center" p={4}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={2}>
        <Typography color="error">{error}</Typography>
      </Box>
    );
  }

  if (associatedPlugins.length === 0) {
    return (
      <Card variant="outlined">
        <CardContent>
          <Typography color="text.secondary">
            No plugins associated with this service.
          </Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card variant="outlined">
      <CardHeader
        title="Associated Plugins"
        subheader={`${associatedPlugins.length} plugin(s)`}
      />
      <CardContent>
        {associatedPlugins.map(plugin => (
          <Accordion key={plugin.id} variant="outlined" sx={{ mb: 1 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box
                display="flex"
                alignItems="center"
                gap={1}
                width="100%"
                pr={1}
              >
                <PowerSettingsNewIcon
                  fontSize="small"
                  color={plugin.enabled ? 'success' : 'disabled'}
                />
                <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
                  {plugin.name}
                </Typography>
                <Chip
                  label={plugin.enabled ? 'enabled' : 'disabled'}
                  size="small"
                  color={plugin.enabled ? 'success' : 'default'}
                />
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  ID: {plugin.id}
                </Typography>
                <Typography
                  variant="body2"
                  component="pre"
                  sx={{
                    mt: 1,
                    p: 1,
                    bgcolor: 'action.hover',
                    borderRadius: 1,
                    overflow: 'auto',
                    fontSize: '0.75rem',
                    maxHeight: 300,
                  }}
                >
                  {JSON.stringify(plugin.config, null, 2)}
                </Typography>
                {(onEditPlugin || onRemovePlugin) && (
                  <Box display="flex" gap={1} mt={1} justifyContent="flex-end">
                    {onEditPlugin && (
                      <Tooltip title="Edit plugin">
                        <IconButton
                          size="small"
                          onClick={() => onEditPlugin(plugin.id, plugin.name)}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    {onRemovePlugin && (
                      <Tooltip title="Remove plugin">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() =>
                            onRemovePlugin(plugin.id, plugin.name)
                          }
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>
                )}
              </Box>
            </AccordionDetails>
          </Accordion>
        ))}
      </CardContent>
    </Card>
  );
}
