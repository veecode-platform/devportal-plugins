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
import { useApi, identityApiRef } from '@backstage/core-plugin-api';
import { useTranslationRef } from '@backstage/core-plugin-api/alpha';
import { costInsightsApiRef } from '@backstage-community/plugin-cost-insights';
import { Cost } from '@backstage-community/plugin-cost-insights-common';
import { Page, Header, Content } from '@backstage/core-components';
import { costInsightsTranslationRef } from '../translations';
import { RichPeriodSelect } from './RichPeriodSelect';
import { GlobalClusterCostCard } from './GlobalClusterCostCard';

export const CleanCostInsightsPage = () => {
  const client = useApi(costInsightsApiRef);
  const identityApi = useApi(identityApiRef);
  const { t } = useTranslationRef(costInsightsTranslationRef);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [costData, setCostData] = useState<Cost | null>(null);
  const [intervals, setIntervals] = useState(() => {
    const today = new Date().toISOString().split('T')[0];
    return `R90/P1D/${today}`;
  });
  const [periodLabel, setPeriodLabel] = useState('Past 90 Days');
  const [tabIndex, setTabIndex] = useState(0);

  useEffect(() => {
    let mounted = true;
    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        const profile = await identityApi.getBackstageIdentity();
        const userGroups = await client.getUserGroups(profile.userEntityRef);
        const targetGroup = userGroups[0]?.id || 'admins';

        const data = await client.getGroupDailyCost(targetGroup, intervals);
        if (mounted) {
          setCostData(data);
        }
      } catch (err: any) {
        if (mounted) setError(err?.message || 'Error fetching cost data');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadData();
    return () => {
      mounted = false;
    };
  }, [client, identityApi, intervals]);

  const totalPeriodCost = useMemo(() => {
    if (!costData?.aggregation) return 0;
    return costData.aggregation.reduce((acc, curr) => acc + curr.amount, 0);
  }, [costData]);

  const dailyAverageCost = useMemo(() => {
    if (!costData?.aggregation || costData.aggregation.length === 0) return 0;
    return totalPeriodCost / costData.aggregation.length;
  }, [costData, totalPeriodCost]);

  const chartData = useMemo(() => {
    if (!costData) return [];
    if (tabIndex === 0 || !costData.groupedCosts) {
      return (costData.aggregation || []).map(item => ({
        date: item.date,
        cost: Number(item.amount.toFixed(2)),
      }));
    }

    if (Array.isArray(costData.groupedCosts.service)) {
      const dates = (costData.aggregation || []).map(a => a.date);
      return dates.map(date => {
        const point: Record<string, any> = { date };
        (costData.groupedCosts!.service as any[]).forEach(svc => {
          const match = (svc.aggregation || []).find((a: any) => a.date === date);
          point[svc.id] = match ? Number(match.amount.toFixed(2)) : 0;
        });
        return point;
      });
    }
    return [];
  }, [costData, tabIndex]);

  const serviceList = useMemo(() => {
    if (!costData?.groupedCosts?.service) return [];
    if (Array.isArray(costData.groupedCosts.service)) {
      return (costData.groupedCosts.service as any[]).map(s => s.id);
    }
    return [];
  }, [costData]);

  const serviceColors = [
    '#1976d2',
    '#388e3c',
    '#f57c00',
    '#7b1fa2',
    '#0097a7',
    '#c2185b',
  ];

  return (
    <Page themeId="tool">
      <Header
        title={t('globalPage.title')}
        subtitle={t('globalPage.subtitle')}
      />
      <Content>
        <Box width="100%" px={0}>
          {error && (
            <Box mb={2}>
              <Alert severity="error">
                {t('globalPage.fetchError' as any, { error })}
              </Alert>
            </Box>
          )}

          {/* Card 1: AWS Cloud Infrastructure Spend */}
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
                <Box display="flex" alignItems="baseline" style={{ gap: 16 }}>
                  <div>
                    <Typography
                      variant="caption"
                      color="textSecondary"
                      style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}
                    >
                      {t('globalPage.totalPeriodLabel' as any, { period: periodLabel })}
                    </Typography>
                    <Typography variant="h4" style={{ fontWeight: 700, color: '#1976d2' }}>
                      ${totalPeriodCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Typography>
                  </div>
                  <Box
                    px={1.5}
                    py={0.5}
                    bgcolor="action.hover"
                    borderRadius={4}
                  >
                    <Typography variant="body2" color="textSecondary">
                      {t('globalPage.dailyAvgFormat' as any, {
                        avg: dailyAverageCost.toFixed(2),
                      })}
                    </Typography>
                  </Box>
                </Box>

                <RichPeriodSelect
                  initialPreset="P90D"
                  onPeriodChange={(newIntervals, newLabel) => {
                    setIntervals(newIntervals);
                    setPeriodLabel(newLabel);
                  }}
                />
              </Box>

              <Divider style={{ marginBottom: 16 }} />

              <Box
                display="flex"
                justifyContent="space-between"
                alignItems="center"
                mb={2}
              >
                <Tabs
                  value={tabIndex}
                  indicatorColor="primary"
                  textColor="primary"
                  onChange={(_, val) => setTabIndex(val)}
                >
                  <Tab label={t('globalPage.totalCostTab')} />
                  {serviceList.length > 1 && (
                    <Tab label={t('globalPage.breakdownTab')} />
                  )}
                </Tabs>
              </Box>

              {loading ? (
                <Box
                  display="flex"
                  justifyContent="center"
                  alignItems="center"
                  height={380}
                >
                  <CircularProgress />
                </Box>
              ) : chartData.length === 0 ? (
                <Box
                  display="flex"
                  justifyContent="center"
                  alignItems="center"
                  height={380}
                >
                  <Typography color="textSecondary">
                    {t('globalPage.noData')}
                  </Typography>
                </Box>
              ) : (
                <Box width="100%" height={400}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={chartData}
                      margin={{ top: 10, right: 30, left: 10, bottom: 20 }}
                    >
                      <defs>
                        <linearGradient
                          id="colorCost"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#1976d2"
                            stopOpacity={0.6}
                          />
                          <stop
                            offset="95%"
                            stopColor="#1976d2"
                            stopOpacity={0.05}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis
                        dataKey="date"
                        tickLine={false}
                        tick={{ fill: '#888', fontSize: 12 }}
                      />
                      <YAxis
                        tickLine={false}
                        tick={{ fill: '#888', fontSize: 12 }}
                        tickFormatter={val => `$${Number(val).toFixed(2)}`}
                      />
                      <Tooltip
                        formatter={(val: any, name: any) => [
                          `$${Number(val).toFixed(2)}`,
                          `${name || 'Daily Cost'}`,
                        ]}
                        labelFormatter={label => `Date: ${label}`}
                        contentStyle={{
                          backgroundColor: '#222',
                          borderRadius: 6,
                          color: '#fff',
                        }}
                      />
                      {tabIndex === 0 ? (
                        <Area
                          type="monotone"
                          dataKey="cost"
                          name="AWS Total Cost"
                          stroke="#1976d2"
                          strokeWidth={2}
                          fillOpacity={1}
                          fill="url(#colorCost)"
                        />
                      ) : (
                        serviceList.map((svc, idx) => (
                          <Area
                            key={svc}
                            type="monotone"
                            dataKey={svc}
                            name={svc}
                            stroke={serviceColors[idx % serviceColors.length]}
                            fill={serviceColors[idx % serviceColors.length]}
                            fillOpacity={0.2}
                            stackId="1"
                          />
                        ))
                      )}
                    </AreaChart>
                  </ResponsiveContainer>
                </Box>
              )}
            </CardContent>
          </Card>

          {/* Card 2: Platform Cluster Workload Spend (OpenCost) */}
          <GlobalClusterCostCard />
        </Box>
      </Content>
    </Page>
  );
};
