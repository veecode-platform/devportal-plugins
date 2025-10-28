import { FC } from 'react';
import Grid from '@mui/material/Grid';
import Button from '@mui/material/Button';
import { Route, Routes } from 'react-router-dom';
import useAsync from 'react-use/esm/useAsync';
import {
  EmptyState,
  ErrorBoundary,
  Progress,
  ResponseErrorPanel,
} from '@backstage/core-components';
import {
  GithubWorkflowsProvider,
  useGithuWorkflowsContext,
} from '../../context/GithubWorkflowsProvider';
import WorkflowTable from '../GitubWorkflowsContent/WorkFlowTable/WorkflowTable';
import WorkflowsDetails from '../GitubWorkflowsContent/WorkflowsDetails/WorkflowsDetails';
import { WorkflowResultsProps } from '../../utils/types';
import { addWorkflows } from '../../context/state';

const TabContent: FC = () => {
  const {
    entity,
    hostname,
    projectName,
    allWorkflowsState,
    dispatchWorkflows,
    listAllWorkflows,
  } = useGithuWorkflowsContext();

  const updateData = async () => {
    const data = await listAllWorkflows([]);
    dispatchWorkflows(addWorkflows(data as WorkflowResultsProps[]));
  };

  const { loading, error } = useAsync(async (): Promise<void> => {
    await listAllWorkflows([]);
  }, [entity]);

  if (loading) {
    return <Progress />;
  }

  if (!error && !allWorkflowsState) {
    return (
      <EmptyState
        missing="data"
        title="No Workflow Data"
        description="This component has GitHub Actions enabled, but no data was found. Have you created any Workflows? Click the button below to create a new Workflow."
        action={
          <Button
            variant="contained"
            color="primary"
            href={`https://${hostname}/${projectName}/actions/new`}
          >
            Create new Workflow
          </Button>
        }
      />
    );
  }

  if (error) {
    return <ResponseErrorPanel error={error} />;
  }

  return (
    <ErrorBoundary>
      <Grid container spacing={3} direction="column">
        <Grid item>
          <WorkflowTable
            items={allWorkflowsState}
            updateData={updateData}
          />
        </Grid>
      </Grid>
    </ErrorBoundary>
  );
};

/**
 * Tab component for GitHub Workflows with table view and routing
 * @public
 */
export const GithubWorkflowsTab: FC = () => {
  return (
    <GithubWorkflowsProvider>
      <Routes>
        <Route path="/" element={<TabContent />} />
        <Route path="/:id" element={<WorkflowsDetails />} />
      </Routes>
    </GithubWorkflowsProvider>
  );
};
