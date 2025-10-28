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
import { makeStyles } from '@mui/styles';
import { WorkflowResultsProps } from '../../utils/types';
import { workflowFilter } from '../../utils/helpers/filters';
import { addWorkflows } from '../../context/state';

const useStyles = makeStyles((theme: any) => ({
  title: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    fontWeight: 600,
  },
  options: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
  },
  buttonRefresh: {
    padding: theme.spacing(1),
  },
  workflowsGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1),
    minHeight: 100,
  },
  loadingComponent: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 100,
  },
  info: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    color: theme.palette.text.secondary,
    padding: theme.spacing(2),
  },
}));

const CardContentComponent: FC = () => {
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const classes = useStyles();
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
    <Typography className={classes.title}>
      <GithubIcon />
      Workflows
    </Typography>
  );

  const ActionsCard = (
    <Box className={classes.options}>
      <SelectBranch />
      <IconButton
        aria-label="Refresh"
        title="Refresh workflows"
        onClick={handleRefresh}
        disabled={refreshing}
        className={classes.buttonRefresh}
      >
        <CachedIcon />
      </IconButton>
    </Box>
  );

  return (
    <Paper>
      <Card>
        <CardHeader title={TitleBar} action={ActionsCard} />
        <CardContent className={classes.workflowsGroup}>
          {refreshing ? (
            <Box className={classes.loadingComponent}>
              <CircularProgress />
            </Box>
          ) : workflows.length === 0 ? (
            <div className={classes.info}>No records to display</div>
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
