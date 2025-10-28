import { FC, useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import CachedIcon from '@mui/icons-material/Cached';
import useAsync from 'react-use/esm/useAsync';
import { Progress } from '@backstage/core-components';
import { useGithuWorkflowsContext } from '../../context/GithubWorkflowsProvider';
import { GithubWorkflowsProvider } from '../../context/GithubWorkflowsProvider';
import SelectBranch from '../SelectBranch/SelectBranch';
import { WorkFlowItem } from '../GitubWorkflowsContent/WorkFlowsCards/WorkFlowItem';
import { StatusWorkflowEnum } from '../../utils/enums/WorkflowListEnum';
import GithubIcon from '../../assets/GithubIcon';
import { WorkflowResultsProps } from '../../utils/types';
import { workflowFilter } from '../../utils/helpers/filters';
import { addWorkflows } from '../../context/state';

const CardContentComponent: FC = () => {
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const {
    entity,
    branch,
    workflowsByAnnotation,
    listAllWorkflows,
    allWorkflowsState,
    dispatchWorkflows,
    setCardsView,
  } = useGithuWorkflowsContext();

  const filters = workflowFilter(workflowsByAnnotation);

  const updateData = async () => {
    const data = await listAllWorkflows(filters);
    dispatchWorkflows(addWorkflows(data as WorkflowResultsProps[]));
  };

  const { loading } = useAsync(async (): Promise<void> => {
    await listAllWorkflows(filters);
  }, [entity]);

  useEffect(() => {
    setCardsView(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    updateData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await updateData();
    setTimeout(() => setRefreshing(false), 1500);
  };

  if (loading) {
    return <Progress />;
  }

  const workflows = allWorkflowsState || [];

  const TitleBar = (
    <Typography
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        fontWeight: 600,
      }}
    >
      <GithubIcon />
      Workflows
    </Typography>
  );

  const ActionsCard = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <SelectBranch />
      <IconButton
        aria-label="Refresh"
        title="Refresh workflows"
        onClick={handleRefresh}
        disabled={refreshing}
        sx={{ padding: 1 }}
      >
        <CachedIcon />
      </IconButton>
    </Box>
  );

  return (
    <Paper>
      <Card>
        <CardHeader title={TitleBar} action={ActionsCard} />
        <CardContent
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            minHeight: 100,
          }}
        >
          {refreshing ? (
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                minHeight: 100,
              }}
            >
              <CircularProgress />
            </Box>
          ) : workflows.length === 0 ? (
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                color: 'text.secondary',
                padding: 2,
              }}
            >
              No records to display
            </Box>
          ) : (
            workflows.map(item => (
              <WorkFlowItem
                key={item.id}
                id={item.id!}
                status={item.status}
                conclusion={
                  item.lastRunId !== undefined
                    ? item.conclusion
                    : StatusWorkflowEnum.default
                }
                workflowName={item.name as string}
                parameters={item.parameters}
                lastRunId={item.lastRunId?.toString()}
                path={item.path as string}
              />
            ))
          )}
        </CardContent>
      </Card>
    </Paper>
  );
};

/**
 * Card component displaying GitHub workflows with action buttons
 * @public
 */
export const GithubWorkflowsCard: FC = () => {
  return (
    <GithubWorkflowsProvider>
      <CardContentComponent />
    </GithubWorkflowsProvider>
  );
};
