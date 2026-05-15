
import { createApiRef } from '@backstage/core-plugin-api';
import { 
  Workflows, 
  Branch, 
  JobsResponse, 
  WorkflowRun, 
  EnvironmentsResponse 
} from '../types/types';

export const githubWorkflowsApiRef = createApiRef<GithubWorkflowsApi>({
  id: 'plugin.githubworkflows',
});

export interface GithubWorkflowsApi {
  listWorkflows(hostname: string, githubRepoSlug: string, branch: string, filter?: string[]): Promise<Workflows[]>;
  listBranchesFromRepo(hostname: string, githubRepoSlug: string): Promise<Branch[]>;
  getBranchDefaultFromRepo(hostname: string, githubRepoSlug: string): Promise<string>;
  startWorkflowRun(hostname: string, githubRepoSlug: string, workflowId: number, branch: string, inputs?: { [key: string]: unknown }): Promise<number>;
  stopWorkflowRun(hostname: string, githubRepoSlug: string, runId: number): Promise<number>;
  listJobsForWorkflowRun(hostname: string, githubRepoSlug: string, id: number, pageSize?: number, page?: number): Promise<JobsResponse>;
  getWorkflowRunById(hostname: string, githubRepoSlug: string, runId: number): Promise<WorkflowRun>;
  downloadJobLogsForWorkflowRun(hostname: string, githubRepoSlug: string, jobId: number): Promise<string>;
  getEnvironmentsList(hostname: string, githubRepoSlug: string): Promise<EnvironmentsResponse>;
}
