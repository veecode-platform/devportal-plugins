import { useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Chip,
  Box,
  CircularProgress,
  LinearProgress,
} from '@material-ui/core';
import StorageIcon from '@material-ui/icons/Storage';
import { useEntity } from '@backstage/plugin-catalog-react';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';
import { useTranslationRef } from '@backstage/core-plugin-api/alpha';
import { costInsightsTranslationRef } from '../translations';

export const EntityClusterCostCard = () => {
  const { entity } = useEntity();
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const { t } = useTranslationRef(costInsightsTranslationRef);

  const [clusterCost, setClusterCost] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const k8sId =
    entity.metadata.annotations?.['backstage.io/kubernetes-id'] ||
    entity.metadata.name;
  const k8sNs =
    entity.metadata.annotations?.['backstage.io/kubernetes-namespace'];

  useEffect(() => {
    let mounted = true;
    async function loadClusterCosts() {
      try {
        const baseUrl = await discoveryApi.getBaseUrl('proxy');
        const res = await fetchApi.fetch(
          `${baseUrl}/opencost/allocation/compute?window=today&aggregate=namespace`,
        );
        const json = await res.json();
        if (mounted && json.data && json.data.length > 0) {
          const allocations = json.data[0];
          let matched = null;

          if (k8sNs && allocations[k8sNs]) {
            matched = allocations[k8sNs];
          } else {
            const searchTerms = [
              (k8sId || '').toLowerCase().replace(/-service$/, ''),
              entity.metadata.name.toLowerCase().replace(/-service$/, ''),
            ].filter(Boolean);

            for (const key of Object.keys(allocations)) {
              const lowerKey = key.toLowerCase();
              if (searchTerms.some(term => lowerKey.includes(term))) {
                matched = allocations[key];
                break;
              }
            }
          }
          setClusterCost(matched || null);
        }
      } catch (err) {
        console.error('Failed to load OpenCost data', err);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadClusterCosts();
    return () => {
      mounted = false;
    };
  }, [discoveryApi, fetchApi, k8sId, k8sNs, entity.metadata.name]);

  const efficiency =
    (clusterCost?.totalEfficiency || clusterCost?.cpuEfficiency || 0) * 100;

  return (
    <Box mt={3}>
      <Card variant="outlined">
        <CardContent>
          <Box
            display="flex"
            justifyContent="space-between"
            alignItems="center"
            mb={2}
          >
            <Box display="flex" alignItems="center">
              <StorageIcon color="primary" style={{ marginRight: 8 }} />
              <div>
                <Typography variant="h6" color="textPrimary">
                  {t('clusterCard.title')}
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  {t('clusterCard.subtitle')}
                </Typography>
              </div>
            </Box>
            <Chip label={t('clusterCard.badge')} color="primary" size="small" />
          </Box>

          {loading ? (
            <Box display="flex" justifyContent="center" p={3}>
              <CircularProgress />
            </Box>
          ) : clusterCost ? (
            <>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell><strong>{t('clusterCard.workloadHeader')}</strong></TableCell>
                    <TableCell align="right"><strong>{t('clusterCard.cpuCostHeader')}</strong></TableCell>
                    <TableCell align="right"><strong>{t('clusterCard.ramCostHeader')}</strong></TableCell>
                    <TableCell align="right"><strong>{t('clusterCard.dailyTotalHeader')}</strong></TableCell>
                    <TableCell align="right"><strong>{t('clusterCard.monthlyProjectionHeader')}</strong></TableCell>
                    <TableCell align="right"><strong>{t('clusterCard.efficiencyHeader')}</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  <TableRow hover>
                    <TableCell>{clusterCost.name || clusterCost.properties?.namespace}</TableCell>
                    <TableCell align="right">${(clusterCost.cpuCost || 0).toFixed(2)}</TableCell>
                    <TableCell align="right">${(clusterCost.ramCost || 0).toFixed(2)}</TableCell>
                    <TableCell align="right"><strong>${(clusterCost.totalCost || 0).toFixed(2)}</strong></TableCell>
                    <TableCell align="right">${((clusterCost.totalCost || 0) * 30).toFixed(2)}</TableCell>
                    <TableCell align="right">
                      <Box display="flex" alignItems="center" justifyContent="flex-end">
                        <Box width={60} mr={1}>
                          <LinearProgress
                            variant="determinate"
                            value={Math.min(efficiency, 100)}
                            color={efficiency < 20 ? 'secondary' : 'primary'}
                          />
                        </Box>
                        <Typography variant="body2" style={{ fontWeight: 600 }}>
                          {efficiency.toFixed(1)}%
                        </Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </>
          ) : (
            <Typography variant="body2" color="textSecondary">
              {t('clusterCard.noWorkload')}
            </Typography>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};
