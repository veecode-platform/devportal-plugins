import {
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  CardHeader,
  CircularProgress,
  IconButton,
  Tooltip,
  Typography,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import type { PluginCard as PluginCardType } from '@veecode-platform/backstage-plugin-kong-service-manager-common';
import { getPluginImage } from '../../assets/pluginImages';

type PluginCardProps = {
  plugin: PluginCardType;
  /** ID from associated plugins list, present when the plugin is enabled */
  associatedId?: string;
  disabling?: boolean;
  onEnable: (pluginSlug: string) => void;
  onEdit: (pluginId: string, pluginName: string) => void;
  onDisable: (pluginId: string, pluginName: string) => void;
};

export function PluginCard({
  plugin,
  associatedId,
  disabling,
  onEnable,
  onEdit,
  onDisable,
}: PluginCardProps) {
  const isAssociated = !!associatedId;

  return (
    <Card
      variant="outlined"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minHeight: '100%',
        borderRadius: '8px',
      }}
    >
      <CardHeader
        title={
          <Typography variant="subtitle1" color="primary" fontWeight={600}>
            {plugin.name}
          </Typography>
        }
        action={
          isAssociated ? (
            <Tooltip title="Edit plugin configuration">
              <IconButton
                size="small"
                onClick={() => onEdit(associatedId, plugin.slug)}
              >
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          ) : undefined
        }
      />

      <Box display="flex" justifyContent="center" py={1}>
        <Box
          component="img"
          src={getPluginImage(plugin.slug)}
          alt={plugin.name}
          sx={{
            width: 60,
            height: 60,
            borderRadius: '4px',
            objectFit: 'contain',
            filter: isAssociated ? 'none' : 'grayscale(100%)',
            opacity: isAssociated ? 1 : 0.4,
          }}
        />
      </Box>

      <CardContent sx={{ flexGrow: 1, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          {plugin.description || plugin.slug}
        </Typography>
      </CardContent>

      <CardActions sx={{ justifyContent: 'center', pb: 2 }}>
        {isAssociated ? (
          <Button
            variant="contained"
            color="primary"
            size="small"
            disabled={disabling}
            onClick={() => onDisable(associatedId, plugin.slug)}
          >
            {disabling ? <CircularProgress size={18} /> : 'Disable'}
          </Button>
        ) : (
          <Button
            variant="outlined"
            color="primary"
            size="small"
            onClick={() => onEnable(plugin.slug)}
          >
            Enable
          </Button>
        )}
      </CardActions>
    </Card>
  );
}
