import React, { useState, useEffect, useMemo } from 'react';
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
import {
  fetchOpenCostAllocations,
  findMatchingNamespaceAllocation,
  DAYS_IN_MONTH,
} from '../api/OpenCostClient';

export type K8sStatus = 'loading' | 'available' | 'not_applicable' | 'error';
export type AwsStatus = 'loading' | 'success' | 'error';

export const CleanEntityCostCard: React.FC = () => {
  const client = useApi(costInsightsApiRef);
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const { entity } = useEntity();
  const { t } = useTranslationRef(costInsightsTranslationRef);

  const [awsStatus, setAwsStatus] = useState<AwsStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [costData, setCostData] = useState<Cost | null>(null);

  const [k8sStatus, setK8sStatus] = useState<K8sStatus>('loading');
  const [k8sMonthlyCost, setK8sMonthlyCost] = useState<number>(0);

  const [intervals, setIntervals] = useState(() => {
    const today = new Date().toISOString().split('T')[0];
    return `R30/P1D/${today}`;
  });
  const [periodLabel, setPeriodLabel] = useState(t('periodSelect.past30Days'));
  const [tabIndex, setTabIndex] = useState(0);

  const entityRef = stringifyEntityRef(entity);
  const tagAnnotation =
    entity.metadata.annotations?.['aws.amazon.com/cost-insights-tags'] ||
    entity.metadata.annotations?.['aws.amazon.com/cost-insights-cost-categories'];

  useEffect(() => {
    let mounted = true;
    async function loadData() {
      // Without the annotation the backend answers 500 ("Annotation not found
      // on entity") — don't query, the render below shows the setup hint instead.
      if (!tagAnnotation) return;
      if (!client.getCatalogEntityDailyCost) return;
      setAwsStatus('loading');
      setError(null);
      setCostData(null); // Clear previous data so stale figures never survive across group/interval change
      try {
        const data = await client.getCatalogEntityDailyCost(entityRef, intervals);
        if (mounted) {
          setCostData(data);
          setAwsStatus('success');
        }
      } catch (err: any) {
        if (mounted) {
          setCostData(null);
          setAwsStatus('error');
          setError(err?.message || t('entityCard.fetchErrorFallback'));
        }
      }
    }
    loadData();
    return () => {
      mounted = false;
    };
  }, [client, entityRef, intervals, t, tagAnnotation]);

  useEffect(() => {
    let mounted = true;
    async function loadK8sTco() {
      if (!tagAnnotation) return; // no AWS side, no consolidated TCO to feed
      setK8sStatus('loading');
      try {
        const allocations = await fetchOpenCostAllocations(
          discoveryApi,
          fetchApi,
          'yesterday',
          'namespace',
        );
        if (!mounted) return;

        const match = findMatchingNamespaceAllocation(allocations, entity);
        if (match) {
          setK8sMonthlyCost(match.monthlyProjection);
          setK8sStatus('available');
        } else {
          setK8sMonthlyCost(0);
          setK8sStatus('not_applicable');
        }
      } catch (_err) {
        if (mounted) {
          setK8sMonthlyCost(0);
          setK8sStatus('error');
        }
      }
    }
    loadK8sTco();
    return () => {
      mounted = false;
    };
  }, [discoveryApi, fetchApi, entity, tagAnnotation]);

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

  const awsMonthlyEstimate = dailyAverageCost * DAYS_IN_MONTH;

  // Fully coordinated banner states: both AWS and K8s considered
  const { bannerTitle, bannerTotal, bannerSubtext, isBannerLoading } = useMemo(() => {
    const awsFormatted = awsMonthlyEstimate.toFixed(2);
    const k8sFormatted = k8sMonthlyCost.toFixed(2);

    if (awsStatus === 'loading' || k8sStatus === 'loading') {
      return {
        bannerTitle: t('entityCard.tcoTitle'),
        bannerTotal: '...',
        bannerSubtext: t('entityCard.tcoCalculating'),
        isBannerLoading: true,
      };
    }

    if (awsStatus === 'error') {
      return {
        bannerTitle: t('entityCard.tcoUnavailableTitle'),
        bannerTotal: '—',
        bannerSubtext: t('entityCard.awsUnavailable'),
        isBannerLoading: false,
      };
    }

    // awsStatus === 'success'
    if (k8sStatus === 'available') {
      const total = (awsMonthlyEstimate + k8sMonthlyCost).toFixed(2);
      return {
        bannerTitle: t('entityCard.tcoTitle'),
        bannerTotal: `$${total}`,
        bannerSubtext: t('entityCard.tcoBreakdown' as any, {
          aws: awsFormatted,
          k8s: k8sFormatted,
        }),
        isBannerLoading: false,
      };
    }

    if (k8sStatus === 'error') {
      return {
        bannerTitle: t('entityCard.tcoCloudOnlyTitle'),
        bannerTotal: `$${awsFormatted}`,
        bannerSubtext: t('entityCard.tcoCloudOnlyUnavailable' as any, {
          aws: awsFormatted,
        }),
        isBannerLoading: false,
      };
    }

    // not_applicable
    return {
      bannerTitle: t('entityCard.tcoCloudOnlyTitle'),
      bannerTotal: `$${awsFormatted}`,
      bannerSubtext: t('entityCard.tcoCloudOnly' as any, {
        aws: awsFormatted,
      }),
      isBannerLoading: false,
    };
  }, [awsMonthlyEstimate, k8sMonthlyCost, awsStatus, k8sStatus, t]);

  const colors = [
    '#1976d2',
    '#388e3c',
    '#f57c00',
    '#d32f2f',
    '#7b1fa2',
    '#0288d1',
  ];

  if (!tagAnnotation) {
    return (
      <Card variant="outlined" style={{ marginBottom: 24 }}>
        <CardContent>
          <Box display="flex" alignItems="center" mb={2}>
            <CloudQueueIcon color="primary" style={{ marginRight: 12, fontSize: 32 }} />
            <Typography variant="h6" color="textPrimary">
              {t('entityCard.cloudTitle')}
            </Typography>
          </Box>
          <Alert severity="info" data-testid="no-annotation-info">
            {t('entityCard.noAnnotationInfo')}
          </Alert>
        </CardContent>
      </Card>
    );
  }

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
                  : t('entityCard.cloudSubtitleMultiple' as any, {
                      tags: tagAnnotation || t('entityCard.defaultTagFallback'),
                    })}
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

        {/* Consolidated Monthly TCO / Cloud Banner */}
        <Box
          mb={2}
          p={1.5}
          bgcolor="action.hover"
          borderRadius={6}
          border={1}
          borderColor="divider"
          data-testid="tco-banner"
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
            {bannerTitle}
          </Typography>
          <Box display="flex" alignItems="baseline" mt={0.5} flexWrap="wrap" style={{ gap: 10 }}>
            <Typography variant="h5" style={{ fontWeight: 700, color: '#1976d2' }}>
              {bannerTotal}
              {!isBannerLoading && bannerTotal !== '—' && (
                <Typography
                  component="span"
                  variant="body2"
                  color="textSecondary"
                  style={{ marginLeft: 4, fontWeight: 500 }}
                >
                  {t('entityCard.perMonth')}
                </Typography>
              )}
            </Typography>
            <Typography variant="body2" color="textSecondary" style={{ fontWeight: 500 }}>
              {bannerSubtext}
            </Typography>
          </Box>
          {awsStatus === 'success' && k8sStatus === 'available' && (
            <Typography
              variant="caption"
              color="textSecondary"
              component="div"
              style={{ marginTop: 4 }}
            >
              {t('entityCard.tcoDisclaimer')}
            </Typography>
          )}
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

        {awsStatus === 'loading' ? (
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
                    const label = name === 'total' ? t('globalPage.totalCostLabel') : name;
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
