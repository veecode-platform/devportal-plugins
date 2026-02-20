import { useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Typography,
  CircularProgress,
} from '@mui/material';
import { useKongServiceManager } from '../../context/KongServiceManagerContext';

export function ServicePage() {
  const { state, fetchServiceInfo } = useKongServiceManager();
  const { serviceInfo, loading, error, instance, serviceName } = state;

  useEffect(() => {
    if (instance && serviceName) {
      fetchServiceInfo();
    }
  }, [instance, serviceName, fetchServiceInfo]);

  if (loading && !serviceInfo) {
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

  if (!serviceInfo) {
    return (
      <Box p={2}>
        <Typography>No service information available.</Typography>
      </Box>
    );
  }

  return (
    <Card variant="outlined">
      <CardHeader
        title={serviceInfo.name}
        subheader={`ID: ${serviceInfo.id}`}
        action={
          <Chip
            label={serviceInfo.enabled ? 'Enabled' : 'Disabled'}
            color={serviceInfo.enabled ? 'success' : 'default'}
            size="small"
          />
        }
      />
      <CardContent>
        <Box
          display="grid"
          gridTemplateColumns="repeat(auto-fill, minmax(200px, 1fr))"
          gap={2}
        >
          <InfoItem label="Protocol" value={serviceInfo.protocol} />
          <InfoItem label="Host" value={serviceInfo.host} />
          <InfoItem label="Port" value={String(serviceInfo.port)} />
          <InfoItem label="Path" value={serviceInfo.path ?? '/'} />
          <InfoItem label="Retries" value={String(serviceInfo.retries)} />
          <InfoItem
            label="Connect Timeout"
            value={`${serviceInfo.connect_timeout}ms`}
          />
          <InfoItem
            label="Write Timeout"
            value={`${serviceInfo.write_timeout}ms`}
          />
          <InfoItem
            label="Read Timeout"
            value={`${serviceInfo.read_timeout}ms`}
          />
        </Box>
        {serviceInfo.tags && serviceInfo.tags.length > 0 && (
          <Box mt={2} display="flex" gap={1} flexWrap="wrap">
            {serviceInfo.tags.map(tag => (
              <Chip key={tag} label={tag} size="small" variant="outlined" />
            ))}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2">{value}</Typography>
    </Box>
  );
}
