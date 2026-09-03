import { useState, useEffect, useMemo } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Tabs,
  Tab,
  CircularProgress,
  Divider,
} from '@material-ui/core';
import CloudQueueIcon from '@material-ui/icons/CloudQueue';
import Alert from '@material-ui/lab/Alert';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { useTranslationRef } from '@backstage/core-plugin-api/alpha';
import { costInsightsApiRef } from '@backstage-community/plugin-cost-insights';
import { Cost } from '@backstage-community/plugin-cost-insights-common';
import { useEntity } from '@backstage/plugin-catalog-react';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { costInsightsTranslationRef } from '../translations';
import { RichPeriodSelect } from './RichPeriodSelect';

export const CleanEntityCostCard = () => {
  const client = useApi(costInsightsApiRef);
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const { entity } = useEntity();
  const { t } = useTranslationRef(costInsightsTranslationRef);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [costData, setCostData] = useState<Cost | null>(null);
  const [k8sMonthlyCost, setK8sMonthlyCost] = useState<number>(0);
  const [intervals, setIntervals] = useState(() => {
    const today = new Date().toISOString().split('T')[0];
    return `R30/P1D/${today}`;
  });
  const [periodLabel, setPeriodLabel] = useState('Past 30 Days');
  const [tabIndex, setTabIndex] = useState(0);

  const entityRef = stringifyEntityRef(entity);
  const tagAnnotation =
    entity.metadata.annotations?.['aws.amazon.com/cost-insights-tags'] ||
    entity.metadata.annotations?.['aws.amazon.com/cost-insights-cost-categories'];

  const k8sNs = entity.metadata.annotations?.['backstage.io/kubernetes-namespace'];
  const k8sId =
    entity.metadata.annotations?.['backstage.io/kubernetes-id'] ||
    entity.metadata.name;

  useEffect(() => {
    let mounted = true;
    async function loadData() {
      if (!client.getCatalogEntityDailyCost) return;
      setLoading(true);
      setError(null);
      try {
        const data = await client.getCatalogEntityDailyCost(entityRef, intervals);
        if (mounted) {
          setCostData(data);
        }
      } catch (err: any) {
        if (mounted) setError(err?.message || 'Error fetching entity cost data');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadData();
    return () => {
      mounted = false;
    };
  }, [client, entityRef, intervals]);

  useEffect(() => {
    let mounted = true;
    async function loadK8sTco() {
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
          if (matched && matched.totalCost) {
            setK8sMonthlyCost(matched.totalCost * 30.5);
          }
        }
      } catch {
        // OpenCost not present or unreachable
      }
    }
    loadK8sTco();
    return () => {
      mounted = false;
    };
  }, [discoveryApi, fetchApi, k8sNs, k8sId, entity.metadata.name]);

  const serviceList = useMemo(() => {
    if (!costData?.groupedCosts?.service) return [];
    if (Array.isArray(costData.groupedCosts.service)) {
      return (costData.groupedCosts.service as any[]).map(s => s.id);
    }
    return [];
  }, [costData]);

  const chartData = useMemo(() => {
    if (!costData?.groupedCosts?.service) return [];

    const dateMap = new Map<string, any>();
    const services = Array.isArray(costData.groupedCosts.service)
      ? (costData.groupedCosts.service as any[])
      : [];

    services.forEach(srv => {
      const srvName = srv.id;
      const agg = srv.aggregation || [];
      agg.forEach((point: any) => {
        const date = point.date;
        if (!dateMap.has(date)) {
          dateMap.set(date, { date, total: 0 });
        }
        const record = dateMap.get(date);
        const amt = Number((point.amount || 0).toFixed(2));
        record[srvName] = amt;
        record.total = Number((record.total + amt).toFixed(2));
      });
    });

    return Array.from(dateMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    );
  }, [costData]);

  const totalPeriodCost = useMemo(() => {
    return chartData.reduce((acc, curr) => acc + (curr.total || 0), 0);
  }, [chartData]);

  const dailyAverageCost = useMemo(() => {
    if (chartData.length === 0) return 0;
    return totalPeriodCost / chartData.length;
  }, [totalPeriodCost, chartData.length]);

  const awsMonthlyEstimate = dailyAverageCost * 30.5;
  const totalMonthlyTco = awsMonthlyEstimate + k8sMonthlyCost;

  const colors = [
    '#1976d2',
    '#388e3c',
    '#f57c00',
    '#d32f2f',
    '#7b1fa2',
    '#0288d1',
  ];

  return (
    <Card variant="outlined" style={{ marginBottom: 24 }}>
      <CardContent>
        {/* Header */}
        <Box
          display="flex"
          justifyContent="space-between"
          alignItems="center"
          flexWrap="wrap"
          mb={2}
          style={{ gap: 16 }}
        >
          <Box display="flex" alignItems="center">
            <CloudQueueIcon color="primary" style={{ marginRight: 12, fontSize: 32 }} />
            <div>
              <Typography variant="h6" color="textPrimary">
                {t('entityCard.cloudTitle')}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                {serviceList.length === 1
                  ? t('entityCard.cloudSubtitleSingle' as any, { service: serviceList[0] })
                  : t('entityCard.cloudSubtitleMultiple' as any, { tags: tagAnnotation || 'default' })}
              </Typography>
            </div>
          </Box>

          <RichPeriodSelect
            initialPreset="P30D"
            onPeriodChange={(newIntervals, newLabel) => {
              setIntervals(newIntervals);
              setPeriodLabel(newLabel);
            }}
          />
        </Box>

        {/* Consolidated Monthly TCO Banner */}
        <Box
          mb={2}
          p={1.5}
          bgcolor="action.hover"
          borderRadius={6}
          border={1}
          borderColor="divider"
        >
          <Typography
            variant="caption"
            color="textSecondary"
            style={{
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              fontWeight: 700,
            }}
          >
            {t('entityCard.tcoTitle')}
          </Typography>
          <Box display="flex" alignItems="baseline" mt={0.5} flexWrap="wrap" style={{ gap: 10 }}>
            <Typography variant="h5" style={{ fontWeight: 700, color: '#1976d2' }}>
              ${totalMonthlyTco.toFixed(2)}
              <Typography component="span" variant="body2" color="textSecondary" style={{ marginLeft: 4, fontWeight: 500 }}>
                /mo
              </Typography>
            </Typography>
            <Typography variant="body2" color="textSecondary" style={{ fontWeight: 500 }}>
              {k8sMonthlyCost > 0
                ? t('entityCard.tcoBreakdown' as any, {
                    aws: awsMonthlyEstimate.toFixed(2),
                    k8s: k8sMonthlyCost.toFixed(2),
                  })
                : t('entityCard.tcoCloudOnly' as any, {
                    aws: awsMonthlyEstimate.toFixed(2),
                  })}
            </Typography>
          </Box>
        </Box>

        {/* KPI Banner */}
        <Box
          display="flex"
          alignItems="baseline"
          mb={2}
          p={1.5}
          bgcolor="action.hover"
          borderRadius={6}
          style={{ gap: 20 }}
        >
          <div>
            <Typography variant="caption" color="textSecondary" style={{ textTransform: 'uppercase' }}>
              {t('globalPage.totalPeriodLabel' as any, { period: periodLabel })}
            </Typography>
            <Typography variant="h5" style={{ fontWeight: 700, color: '#1976d2' }}>
              ${totalPeriodCost.toFixed(2)}
            </Typography>
          </div>
          <Divider orientation="vertical" flexItem />
          <div>
            <Typography variant="caption" color="textSecondary" style={{ textTransform: 'uppercase' }}>
              {t('globalPage.dailyAverageLabel')}
            </Typography>
            <Typography variant="subtitle1" style={{ fontWeight: 600 }}>
              {t('entityCard.dailyAvgFormat' as any, { avg: dailyAverageCost.toFixed(2) })}
            </Typography>
          </div>
        </Box>

        {serviceList.length > 1 && (
          <Box mb={2}>
            <Tabs
              value={tabIndex}
              indicatorColor="primary"
              textColor="primary"
              onChange={(_, val) => setTabIndex(val)}
            >
              <Tab label={t('entityCard.totalCostTab')} />
              <Tab label={t('entityCard.breakdownTab')} />
            </Tabs>
          </Box>
        )}

        <Divider style={{ marginBottom: 20 }} />

        {error && (
          <Box mb={2}>
            <Alert severity="error">
              {t('entityCard.fetchError' as any, { error })}
            </Alert>
          </Box>
        )}

        {loading ? (
          <Box
            display="flex"
            justifyContent="center"
            alignItems="center"
            height={300}
          >
            <CircularProgress />
          </Box>
        ) : chartData.length === 0 ? (
          <Box
            display="flex"
            justifyContent="center"
            alignItems="center"
            height={200}
          >
            <Typography color="textSecondary">
              {t('entityCard.noData')}
            </Typography>
          </Box>
        ) : (
          <Box height={350} width="100%">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={chartData}
                margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1976d2" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#1976d2" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis
                  tick={{ fontSize: 12 }}
                  tickFormatter={val => `$${Number(val).toFixed(2)}`}
                />
                <Tooltip
                  formatter={(value: any, name: any) => {
                    const num = Number(value || 0);
                    const formatted = `$${num.toFixed(2)}`;
                    const label = name === 'total' ? 'AWS Total Cost' : name;
                    return [formatted, label];
                  }}
                />
                {tabIndex === 0 || serviceList.length <= 1 ? (
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="#1976d2"
                    fillOpacity={1}
                    fill="url(#colorTotal)"
                  />
                ) : (
                  serviceList.map((srv, idx) => (
                    <Area
                      key={srv}
                      type="monotone"
                      dataKey={srv}
                      stackId="1"
                      stroke={colors[idx % colors.length]}
                      fill={colors[idx % colors.length]}
                    />
                  ))
                )}
              </AreaChart>
            </ResponsiveContainer>
          </Box>
        )}
      </CardContent>
    </Card>
  );
};
