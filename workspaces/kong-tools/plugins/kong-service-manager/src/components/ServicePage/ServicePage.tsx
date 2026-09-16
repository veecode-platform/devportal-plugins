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
import { useTranslation } from '../../hooks/useTranslation';

export function ServicePage() {
  const { t } = useTranslation();
  const { state, fetchServiceInfo } = useKongServiceManager();
  const { serviceInfo, loading, instance, serviceName } = state;

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

  if (!serviceInfo) {
    return (
      <Box p={2}>
        <Typography>{t('servicePage.noServiceInfo')}</Typography>
      </Box>
    );
  }

  return (
    <Card variant="outlined">
      <CardHeader
        title={serviceInfo.name}
        subheader={t('servicePage.idLabel', { id: serviceInfo.id })}
        action={
          <Chip
            label={serviceInfo.enabled ? t('servicePage.enabled') : t('servicePage.disabled')}
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
          <InfoItem label={t('servicePage.fields.protocol')} value={serviceInfo.protocol} />
          <InfoItem label={t('servicePage.fields.host')} value={serviceInfo.host} />
          <InfoItem label={t('servicePage.fields.port')} value={String(serviceInfo.port)} />
          <InfoItem label={t('servicePage.fields.path')} value={serviceInfo.path ?? '/'} />
          <InfoItem label={t('servicePage.fields.retries')} value={String(serviceInfo.retries)} />
          <InfoItem
            label={t('servicePage.fields.connectTimeout')}
            value={`${serviceInfo.connect_timeout}ms`}
          />
          <InfoItem
            label={t('servicePage.fields.writeTimeout')}
            value={`${serviceInfo.write_timeout}ms`}
          />
          <InfoItem
            label={t('servicePage.fields.readTimeout')}
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
