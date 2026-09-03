import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  CircularProgress,
  Chip,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  LinearProgress,
} from '@material-ui/core';
import Alert from '@material-ui/lab/Alert';
import StorageIcon from '@material-ui/icons/Storage';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { useEntity } from '@backstage/plugin-catalog-react';
import { useTranslationRef } from '@backstage/core-plugin-api/alpha';
import { costInsightsTranslationRef } from '../translations';
import {
  fetchOpenCostAllocations,
  findMatchingNamespaceAllocation,
  DAYS_IN_MONTH,
  OpenCostAllocation,
} from '../api/OpenCostClient';

export const EntityClusterCostCard = () => {
  const { entity } = useEntity();
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const { t } = useTranslationRef(costInsightsTranslationRef);

  const [clusterCost, setClusterCost] = useState<OpenCostAllocation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function loadClusterCosts() {
      setLoading(true);
      setError(null);
      try {
        const allocations = await fetchOpenCostAllocations(
          discoveryApi,
          fetchApi,
          'today',
          'namespace',
        );
        if (mounted) {
          const match = findMatchingNamespaceAllocation(allocations, entity);
          setClusterCost(match ? match.allocation : null);
        }
      } catch (err: any) {
        if (mounted) {
          setError(err?.message || 'Error fetching OpenCost data');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadClusterCosts();
    return () => {
      mounted = false;
    };
  }, [discoveryApi, fetchApi, entity]);

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

          {error ? (
            <Alert severity="warning">
              {t('clusterCard.errorFetching' as any, { error })}
            </Alert>
          ) : loading ? (
            <Box display="flex" justifyContent="center" p={3}>
              <CircularProgress />
            </Box>
          ) : clusterCost ? (
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
                  <TableCell>{clusterCost.name}</TableCell>
                  <TableCell align="right">${(clusterCost.cpuCost || 0).toFixed(2)}</TableCell>
                  <TableCell align="right">${(clusterCost.ramCost || 0).toFixed(2)}</TableCell>
                  <TableCell align="right"><strong>${(clusterCost.totalCost || 0).toFixed(2)}</strong></TableCell>
                  <TableCell align="right">${((clusterCost.totalCost || 0) * DAYS_IN_MONTH).toFixed(2)}</TableCell>
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
