import React, { useEffect, useState, useMemo } from 'react';
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
  Divider,
  TextField,
  InputAdornment,
} from '@material-ui/core';
import StorageIcon from '@material-ui/icons/Storage';
import SearchIcon from '@material-ui/icons/Search';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';
import { useTranslationRef } from '@backstage/core-plugin-api/alpha';
import { costInsightsTranslationRef } from '../translations';

export const GlobalClusterCostCard: React.FC = () => {
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const { t } = useTranslationRef(costInsightsTranslationRef);

  const [allocations, setAllocations] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

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
          setAllocations(json.data[0] || {});
        }
      } catch (err) {
        console.error('Failed to load global OpenCost data', err);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadClusterCosts();
    return () => {
      mounted = false;
    };
  }, [discoveryApi, fetchApi]);

  const namespaceList = useMemo(() => {
    const list = Object.entries(allocations).map(([name, data]: [string, any]) => ({
      name,
      cpuCost: data.cpuCost || 0,
      ramCost: data.ramCost || 0,
      totalCost: data.totalCost || 0,
      monthlyProjection: (data.totalCost || 0) * 30,
      efficiency: (data.totalEfficiency || data.cpuEfficiency || 0) * 100,
      isPlatform:
        name.includes('system') ||
        name.includes('monitoring') ||
        name.includes('prometheus') ||
        name.includes('opencost') ||
        name.includes('ingress') ||
        name.includes('kong'),
    }));

    return list.sort((a, b) => b.totalCost - a.totalCost);
  }, [allocations]);

  const filteredNamespaces = useMemo(() => {
    if (!search.trim()) return namespaceList;
    const q = search.toLowerCase();
    return namespaceList.filter(n => n.name.toLowerCase().includes(q));
  }, [namespaceList, search]);

  const totals = useMemo(() => {
    const daily = namespaceList.reduce((acc, curr) => acc + curr.totalCost, 0);
    const monthly = daily * 30;
    const active = namespaceList.filter(n => n.totalCost > 0);
    const avgEff =
      active.length > 0
        ? active.reduce((acc, curr) => acc + curr.efficiency, 0) / active.length
        : 0;
    return { daily, monthly, avgEff };
  }, [namespaceList]);

  return (
    <Box mt={3}>
      <Card variant="outlined" style={{ width: '100%' }}>
        <CardContent>
          <Box
            display="flex"
            justifyContent="space-between"
            alignItems="center"
            flexWrap="wrap"
            mb={2}
            style={{ gap: 16 }}
          >
            <Box display="flex" alignItems="center">
              <StorageIcon color="primary" style={{ marginRight: 12, fontSize: 32 }} />
              <div>
                <Typography variant="h6" color="textPrimary">
                  {t('globalCluster.title')}
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  {t('globalCluster.subtitle')}
                </Typography>
              </div>
            </Box>
            <Box display="flex" alignItems="center" style={{ gap: 12 }}>
              <TextField
                placeholder={t('globalCluster.searchPlaceholder')}
                value={search}
                onChange={e => setSearch(e.target.value)}
                size="small"
                variant="outlined"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" color="action" />
                    </InputAdornment>
                  ),
                }}
              />
              <Chip
                label={t('globalCluster.badge')}
                color="primary"
                size="small"
                style={{ fontWeight: 600 }}
              />
            </Box>
          </Box>

          {/* Top Summary Metrics */}
          <Box
            display="flex"
            alignItems="center"
            mb={2}
            p={1.5}
            bgcolor="action.hover"
            borderRadius={6}
            flexWrap="wrap"
            style={{ gap: 24 }}
          >
            <div>
              <Typography variant="caption" color="textSecondary" style={{ textTransform: 'uppercase' }}>
                {t('globalCluster.totalClusterDaily')}
              </Typography>
              <Typography variant="h5" style={{ fontWeight: 700, color: '#1976d2' }}>
                ${totals.daily.toFixed(2)}{t('globalCluster.perDay')}
              </Typography>
            </div>
            <Divider orientation="vertical" flexItem />
            <div>
              <Typography variant="caption" color="textSecondary" style={{ textTransform: 'uppercase' }}>
                {t('globalCluster.totalClusterMonthly')}
              </Typography>
              <Typography variant="h5" style={{ fontWeight: 700 }}>
                ${totals.monthly.toFixed(2)}{t('globalCluster.perMonth')}
              </Typography>
            </div>
            <Divider orientation="vertical" flexItem />
            <div>
              <Typography variant="caption" color="textSecondary" style={{ textTransform: 'uppercase' }}>
                {t('globalCluster.efficiencyAvg')}
              </Typography>
              <Typography variant="h5" style={{ fontWeight: 700, color: totals.avgEff < 20 ? '#f57c00' : '#388e3c' }}>
                {totals.avgEff.toFixed(1)}%
              </Typography>
            </div>
          </Box>

          <Divider style={{ marginBottom: 16 }} />

          {loading ? (
            <Box display="flex" justifyContent="center" p={4}>
              <CircularProgress />
            </Box>
          ) : filteredNamespaces.length === 0 ? (
            <Typography variant="body2" color="textSecondary">
              {t('clusterCard.noWorkload')}
            </Typography>
          ) : (
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
                {filteredNamespaces.map(row => (
                  <TableRow key={row.name} hover>
                    <TableCell>
                      <Box display="flex" alignItems="center" style={{ gap: 8 }}>
                        <span>{row.name}</span>
                        {row.isPlatform && (
                          <Chip
                            label="Platform / Core"
                            size="small"
                            variant="outlined"
                            style={{ height: 20, fontSize: 10 }}
                          />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell align="right">${row.cpuCost.toFixed(2)}</TableCell>
                    <TableCell align="right">${row.ramCost.toFixed(2)}</TableCell>
                    <TableCell align="right">
                      <strong>${row.totalCost.toFixed(2)}</strong>
                    </TableCell>
                    <TableCell align="right">${row.monthlyProjection.toFixed(2)}</TableCell>
                    <TableCell align="right">
                      <Box display="flex" alignItems="center" justifyContent="flex-end">
                        <Box width={60} mr={1}>
                          <LinearProgress
                            variant="determinate"
                            value={Math.min(row.efficiency, 100)}
                            color={row.efficiency < 20 ? 'secondary' : 'primary'}
                          />
                        </Box>
                        <Typography variant="body2" style={{ fontWeight: 600 }}>
                          {row.efficiency.toFixed(1)}%
                        </Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};
