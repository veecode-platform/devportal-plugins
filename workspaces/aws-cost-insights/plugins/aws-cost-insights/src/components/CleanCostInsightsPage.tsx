import React, { useState, useEffect, useMemo } from 'react';
import {
  Page,
  Header,
  Content,
} from '@backstage/core-components';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Tabs,
  Tab,
  CircularProgress,
  Divider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
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
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { costInsightsApiRef } from '@backstage-community/plugin-cost-insights';
import {
  Cost,
  Group,
  Project,
} from '@backstage-community/plugin-cost-insights-common';
import { costInsightsTranslationRef } from '../translations';
import { RichPeriodSelect } from './RichPeriodSelect';
import { GlobalClusterCostCard } from './GlobalClusterCostCard';

export const CleanCostInsightsPage: React.FC = () => {
  const client = useApi(costInsightsApiRef);
  const identityApi = useApi(identityApiRef);
  const catalogApi = useApi(catalogApiRef);
  const { t } = useTranslationRef(costInsightsTranslationRef);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [costData, setCostData] = useState<Cost | null>(null);
  const [userGroups, setUserGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [intervals, setIntervals] = useState(() => {
    const today = new Date().toISOString().split('T')[0];
    return `R90/P1D/${today}`;
  });
  const [periodLabel, setPeriodLabel] = useState(t('periodSelect.past90Days'));
  const [tabIndex, setTabIndex] = useState(0);

  useEffect(() => {
    let mounted = true;
    async function loadGroups() {
      setLoading(true);
      setError(null);
      try {
        const profile = await identityApi.getBackstageIdentity();
        const groups = await client.getUserGroups(profile.userEntityRef);
        // Only offer groups whose entity carries the Cost Explorer filter
        // annotation — the backend answers 500 for any group without it, so an
        // unannotated group in the dropdown is a guaranteed error banner.
        let annotated = groups;
        try {
          // Group.id is already a full entity ref (stringifyEntityRef in
          // getUserGroups) — prefixing it again builds an invalid ref that
          // matches nothing and silently filters every group out.
          const { items } = await catalogApi.getEntitiesByRefs({
            entityRefs: groups.map(g => g.id),
            fields: ['metadata.annotations'],
          });
          annotated = groups.filter((_, idx) => {
            const ann = items[idx]?.metadata?.annotations ?? {};
            return (
              ann['aws.amazon.com/cost-insights-tags'] ||
              ann['aws.amazon.com/cost-insights-cost-categories']
            );
          });
        } catch {
          // Catalog lookup failed: keep the unfiltered list rather than hiding
          // groups that might work.
        }
        if (mounted) {
          setUserGroups(annotated);
          if (annotated.length > 0) {
            setSelectedGroup(annotated[0].id);
          } else {
            setLoading(false);
          }
        }
      } catch (err: any) {
        if (mounted) {
          setError(err?.message || t('globalPage.fetchGroupsFallback'));
          setLoading(false);
        }
      }
    }
    loadGroups();
    return () => {
      mounted = false;
    };
  }, [client, identityApi, catalogApi, t]);

  useEffect(() => {
    let mounted = true;
    // Projects = AWS linked accounts (upstream Cost Insights contract). An
    // older backend without /v1/projects just means no selector — the page
    // works exactly as before, so failures here stay silent by design.
    Promise.resolve()
      .then(() => client.getGroupProjects(''))
      .then(list => {
        if (mounted) setProjects(list);
      })
      .catch(() => {
        if (mounted) setProjects([]);
      });
    return () => {
      mounted = false;
    };
  }, [client]);

  useEffect(() => {
    let mounted = true;
    if (!selectedGroup) return;

    async function loadData() {
      setLoading(true);
      setError(null);
      setCostData(null); // Clear previous data so stale figures never survive across group/interval change
      try {
        const data =
          selectedProject !== 'all'
            ? await client.getProjectDailyCost(selectedProject, intervals)
            : await client.getGroupDailyCost(selectedGroup, intervals);
        if (mounted) {
          setCostData(data);
        }
      } catch (err: any) {
        if (mounted) {
          setCostData(null);
          setError(err?.message || t('globalPage.fetchErrorFallback'));
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadData();
    return () => {
      mounted = false;
    };
  }, [client, selectedGroup, selectedProject, intervals, t]);

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
    '#d32f2f',
    '#7b1fa2',
    '#0288d1',
    '#00796b',
    '#c2185b',
  ];

  return (
    <Page themeId="tool">
      <Header
        title={t('globalPage.title')}
        subtitle={t('globalPage.subtitle')}
      />
      <Content>
        <Box mb={4}>
          <Card variant="outlined">
            <CardContent>
              <Box
                display="flex"
                justifyContent="space-between"
                alignItems="center"
                flexWrap="wrap"
                mb={2}
                style={{ gap: 16 }}
              >
                <Box display="flex" alignItems="center" flexWrap="wrap" style={{ gap: 16 }}>
                  {userGroups.length > 1 && (
                    <FormControl variant="outlined" size="small" style={{ minWidth: 200 }}>
                      <InputLabel id="cost-group-select-label">{t('globalPage.teamGroupLabel')}</InputLabel>
                      <Select
                        labelId="cost-group-select-label"
                        value={selectedGroup}
                        onChange={e => setSelectedGroup(e.target.value as string)}
                        label={t('globalPage.teamGroupLabel')}
                      >
                        {userGroups.map(g => (
                          <MenuItem key={g.id} value={g.id}>
                            {g.name || g.id}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  )}

                  {projects.length > 0 && (
                    <FormControl variant="outlined" size="small" style={{ minWidth: 200 }}>
                      <InputLabel id="cost-account-select-label">{t('globalPage.accountLabel')}</InputLabel>
                      <Select
                        labelId="cost-account-select-label"
                        value={selectedProject}
                        onChange={e => setSelectedProject(e.target.value as string)}
                        label={t('globalPage.accountLabel')}
                      >
                        <MenuItem value="all">{t('globalPage.allAccounts')}</MenuItem>
                        {projects.map(p => (
                          <MenuItem key={p.id} value={p.id}>
                            {p.name ? `${p.name} (${p.id})` : p.id}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  )}

                  {selectedGroup && (
                    <Box
                      display="flex"
                      alignItems="baseline"
                      p={1}
                      bgcolor="action.hover"
                      borderRadius={6}
                      style={{ gap: 16 }}
                    >
                      <div>
                        <Typography
                          variant="caption"
                          color="textSecondary"
                          style={{ textTransform: 'uppercase' }}
                        >
                          {t('globalPage.totalPeriodLabel' as any, {
                            period: periodLabel,
                          })}
                        </Typography>
                        <Typography
                          variant="h5"
                          style={{ fontWeight: 700, color: '#1976d2' }}
                        >
                          ${totalPeriodCost.toFixed(2)}
                        </Typography>
                      </div>
                      <Divider orientation="vertical" flexItem />
                      <div>
                        <Typography
                          variant="caption"
                          color="textSecondary"
                          style={{ textTransform: 'uppercase' }}
                        >
                          {t('globalPage.dailyAverageLabel')}
                        </Typography>
                        <Typography variant="subtitle2" color="textSecondary">
                          {t('globalPage.dailyAvgFormat' as any, {
                            avg: dailyAverageCost.toFixed(2),
                          })}
                        </Typography>
                      </div>
                    </Box>
                  )}
                </Box>

                <RichPeriodSelect
                  initialPreset="P90D"
                  onPeriodChange={(newIntervals, newLabel) => {
                    setIntervals(newIntervals);
                    setPeriodLabel(newLabel);
                  }}
                />
              </Box>

              {error && (
                <Box mb={2}>
                  <Alert severity="error">
                    {t('globalPage.fetchError' as any, { error })}
                  </Alert>
                </Box>
              )}

              {!loading && userGroups.length === 0 && (
                <Box mb={2}>
                  <Alert severity="info">
                    {t('globalPage.noGroups')}
                  </Alert>
                </Box>
              )}

              {selectedGroup && (
                <Box mb={2}>
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
              )}

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
                          `${name || t('globalPage.dailyCostTooltip')}`,
                        ]}
                        labelFormatter={label => `${t('globalPage.dateAxisLabel')}: ${label}`}
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
                          name={t('globalPage.totalCostLabel')}
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
                          />
                        ))
                      )}
                    </AreaChart>
                  </ResponsiveContainer>
                </Box>
              )}
            </CardContent>
          </Card>
        </Box>

        <GlobalClusterCostCard />
      </Content>
    </Page>
  );
};
