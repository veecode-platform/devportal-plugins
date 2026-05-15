import {
  Workflows,
  Branch,
  JobsResponse,
  WorkflowRun,
  EnvironmentsResponse,
} from '@veecode-platform/github-workflows-common';

/**
 * Backend service interface for GitHub Workflows.
 *
 * Mirrors the frontend GithubWorkflowsApi from common, using the same shared types.
 * Implement this interface to provide a real or mock service.
 *
 * @public
 */
export interface GithubWorkflowsServiceApi {
  listWorkflows(
    hostname: string,
    githubRepoSlug: string,
    branch: string,
    filter?: string[],
  ): Promise<Workflows[]>;

  listBranchesFromRepo(
    hostname: string,
    githubRepoSlug: string,
  ): Promise<Branch[]>;

  getBranchDefaultFromRepo(
    hostname: string,
    githubRepoSlug: string,
  ): Promise<string>;

  startWorkflowRun(
    hostname: string,
    githubRepoSlug: string,
    workflowId: number,
    branch: string,
    inputs?: { [key: string]: unknown },
  ): Promise<number>;

  stopWorkflowRun(
    hostname: string,
    githubRepoSlug: string,
    runId: number,
  ): Promise<number>;

  listJobsForWorkflowRun(
    hostname: string,
    githubRepoSlug: string,
    id: number,
    pageSize?: number,
    page?: number,
  ): Promise<JobsResponse>;

  getWorkflowRunById(
    hostname: string,
    githubRepoSlug: string,
    runId: number,
  ): Promise<WorkflowRun>;

  downloadJobLogsForWorkflowRun(
    hostname: string,
    githubRepoSlug: string,
    jobId: number,
  ): Promise<string>;

  getEnvironmentsList(
    hostname: string,
    githubRepoSlug: string,
  ): Promise<EnvironmentsResponse>;
}
