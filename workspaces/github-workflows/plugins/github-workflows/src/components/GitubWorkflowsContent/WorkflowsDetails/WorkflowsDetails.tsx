import { useReducer } from 'react';
import { useRouteRefParams } from '@backstage/core-plugin-api';
import useAsync from 'react-use/lib/useAsync';
import { Progress, ResponseErrorPanel } from '@backstage/core-components';
import { useWorkflowDetailsStyles } from './styles';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import Tooltip from '@mui/material/Tooltip';
import { DetailsComponent } from './DetailsComponent';
import {JobsComponent} from './JobsComponent/JobsComponent';
import KeyboardReturnIcon from '@mui/icons-material/KeyboardReturn';
import { useNavigate } from 'react-router-dom'
import { useGithuWorkflowsContext } from '../../../context';
import { buildRouteRef } from '../../../routes';
import { addJobs, addWorkflowRun, initialJobsState, initialWorkflowRunState, JobsReducer, WorkflowRunReducer } from './state';
import { WorkflowRun } from '../../../utils/types';

const WorkflowsDetails = () => {

  const [workflowRunState,dispatchWorkflowRun] = useReducer(WorkflowRunReducer,initialWorkflowRunState);
  const [jobsRunState, dispatchJobs] = useReducer(JobsReducer,initialJobsState);
  const { id } = useRouteRefParams(buildRouteRef);
  const { getWorkflowById,listJobsForWorkflowRun } = useGithuWorkflowsContext();
  const { root,container,footer } = useWorkflowDetailsStyles();
  const navigate = useNavigate();

  const { loading, error } = useAsync(async (): Promise<void> => {
    const workflowPromise = await getWorkflowById(Number(id));
    const jobsPromise = await listJobsForWorkflowRun(Number(id));
    const [workflow, jobs] = await Promise.all([workflowPromise, jobsPromise]);
    dispatchWorkflowRun(addWorkflowRun(workflow as WorkflowRun));
    dispatchJobs(addJobs(jobs));
  }, []);

  const handleBackNavigation = () => {
    navigate(-1)
  }

  if(loading){
    return <Progress />
  }

  if (error) {
    return <ResponseErrorPanel error={error} />;
  }


  return (
        <div className={root}>
          <Grid container className={container} direction='column'>
              <DetailsComponent
                runStartedAt={workflowRunState!.run_started_at}
                updatedAt={workflowRunState!.updated_at}
                status={workflowRunState!.status}
                conclusion={workflowRunState!.conclusion}
                avatar={workflowRunState!.actor!.avatar_url}
                author={workflowRunState!.actor!.login}
                branch={workflowRunState!.head_branch}
                headCommit={workflowRunState!.head_sha!}
                repo={workflowRunState!.repository!.full_name}
               />
               <JobsComponent 
                 path={workflowRunState!.path!}
                 event={workflowRunState!.event!}
                 jobs={jobsRunState}
                 />   
               <div className={footer}>
                <Tooltip title="Back" arrow placement='top-start'>
                  <Button variant="outlined" onClick={handleBackNavigation}>
                    <KeyboardReturnIcon/> 
                  </Button>
                </Tooltip> 
               </div>           
            </Grid>
        </div>
  )
}

export default WorkflowsDetails