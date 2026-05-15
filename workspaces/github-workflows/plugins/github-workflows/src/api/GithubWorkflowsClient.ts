import { DiscoveryApi } from "@backstage/core-plugin-api";
import { GithubWorkflowsApi } from "./GithubWorkflowsApi";
import { Options, Workflows } from "./types";


/**
 * 
 * HTTP Client implementation - calls backend API instead of using Octokit directly
 * All GitHub authentication is handled by the backend.
 * @public
 * 
 */ 

class Client {
  private readonly discoveryApi: DiscoveryApi;

  constructor(options: Options) {
    this.discoveryApi = options.discoveryApi;
  }

  private async fetchFromBackend<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
    const baseUrl = await this.discoveryApi.getBaseUrl('github-workflow-backend');
    const queryString = new URLSearchParams(params).toString();
    const url = `${baseUrl}/${endpoint}${queryString ? `?${queryString}` : ''}`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Backend API error: ${response.status} ${response.statusText}`);
    }
    
    return response.json();
  }

  private async postToBackend<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
    const baseUrl = await this.discoveryApi.getBaseUrl('github-workflow-backend');
    const url = `${baseUrl}/${endpoint}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    
    if (!response.ok) {
      throw new Error(`Backend API error: ${response.status} ${response.statusText}`);
    }
    
    return response.json();
  }

  async listWorkflows(hostname: string, githubRepoSlug: string, branch: string, filter?: string[]): Promise<Workflows[]>{
    const params = {
      hostname,
      githubRepoSlug,
      branch,
      ...(filter && filter.length > 0 && { filter: filter.join(',') })
    };
    
    return this.fetchFromBackend<Workflows[]>('workflows', params);
  }

  async listBranchesFromRepo(hostname: string, githubRepoSlug: string): Promise<any[]>{
    const params = { hostname, githubRepoSlug };
    return this.fetchFromBackend<any[]>('branches', params);
  }

  async getBranchDefaultFromRepo(hostname: string, githubRepoSlug: string):Promise<string>{
    const params = { hostname, githubRepoSlug };
    return this.fetchFromBackend<string>('default-branch', params);
  }

  async startWorkflowRun(hostname:string, githubRepoSlug: string, workflowId: number, branch: string, inputs?: {[key: string]: unknown}): Promise<number>{
    const body = {
      hostname,
      githubRepoSlug,
      workflowId,
      branch,
      ...(inputs && { inputs })
    };
    
    const response = await this.postToBackend<{ status: number }>('start-workflow', body);
    return response.status;
  }

  async stopWorkflowRun(hostname:string,githubRepoSlug: string, runId: number):Promise<number>{
    const body = {
      hostname,
      githubRepoSlug,
      runId
    };
    
    const response = await this.postToBackend<{ status: number }>('stop-workflow', body);
    return response.status;
  }

  async listJobsForWorkflowRun(hostname: string, githubRepoSlug: string, id: number, pageSize?: number, page?: number): Promise<any>{
    const params = {
      hostname,
      githubRepoSlug,
      id: id.toString(),
      ...(pageSize && { pageSize: pageSize.toString() }),
      ...(page && { page: page.toString() })
    };
    
    return this.fetchFromBackend<any>('jobs', params);
  }

  async getWorkflowRunById(hostname:string, githubRepoSlug: string, runId: number):Promise<any>{
    const params = {
      hostname,
      githubRepoSlug,
      runId: runId.toString()
    };
    
    return this.fetchFromBackend<any>('workflow-run', params);
  }

  async downloadJobLogsForWorkflowRun(hostname:string, githubRepoSlug: string, jobId: number): Promise<string>{
    const params = {
      hostname,
      githubRepoSlug,
      jobId: jobId.toString()
    };
    
    return this.fetchFromBackend<string>('download-logs', params);
  }

  async getEnvironmentsList(hostname:string,githubRepoSlug: string): Promise<any>{
    const params = { hostname, githubRepoSlug };
    return this.fetchFromBackend<any>('environments', params);
  }
}

// Export Client as GithubWorkflowsClient for backwards compatibility
export class GithubWorkflowsClient extends Client implements GithubWorkflowsApi {}