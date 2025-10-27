import { ConfigApi } from '@backstage/core-plugin-api';
import { Octokit, RestEndpointMethodTypes } from '@octokit/rest';
import { ScmIntegrations, DefaultGithubCredentialsProvider } from '@backstage/integration';
import YAML from 'js-yaml';
import { LoggerService } from '@backstage/backend-plugin-api';

export interface GithubFileResponse {
  type: 'dir' | 'file' | 'submodule' | 'symlink';
  encoding: string;
  size: number;
  name: string;
  path: string;
  content: string;
  sha: string;
  url: string;
  git_url: string;
  html_url: string;
  download_url: string;
  _links: {
    git: string;
    self: string;
    html: string;
  };
}

export interface WorkflowDispatchParameters {
  name: string;
  description: string;
  default: string;
  required: boolean;
  type: string;
  options?: string[];
}

export interface Workflows {
  workflow: {
    id: number;
    name: string;
    state: string;
    url: string;
    path: string;
    createdAt: string;
    updatedAt: string;
  };
  latestRun: {
    id?: number;
    status?: string;
    conclusion?: string;
  };
  parameters: WorkflowDispatchParameters[];
}

export class GithubWorkflowsService {
  private readonly integrations: ScmIntegrations;
  private readonly credentialsProvider: DefaultGithubCredentialsProvider;
  private readonly logger: LoggerService;

  constructor(configApi: ConfigApi, logger: LoggerService) {
    this.integrations = ScmIntegrations.fromConfig(configApi);
    this.credentialsProvider = DefaultGithubCredentialsProvider.fromIntegrations(this.integrations);
    this.logger = logger;
  }

  /**
   * Create an Octokit instance authenticated for the given repository URL.
   * Uses ScmIntegrations to handle GitHub Apps and tokens automatically.
   * 
   * IMPORTANT: For GitHub Apps, repoSlug is REQUIRED to select the correct installation.
   */
  private async getOctokit(hostname: string = 'github.com', repoSlug: string): Promise<Octokit> {
    // IMPORTANT: For GitHub Apps, a repo URL is required to select the right installation
    const targetUrl = `https://${hostname}/${repoSlug}`;
    
    const ghIntegration = this.integrations.github.byUrl(targetUrl);
    if (!ghIntegration) {
      throw new Error(`No GitHub integration configured for host: ${hostname}`);
    }

    // Get credentials - this handles GitHub Apps automatically!
    // For GitHub Apps, it will get an installation token
    // For PATs, it will return the configured token
    const credential = await this.credentialsProvider.getCredentials({ url: targetUrl });
    const token = credential?.token;
    const headers = credential?.headers || {};

    if (!token) {
      throw new Error(`No token available for ${hostname}`);
    }

    // Determine auth type based on token format
    // GitHub App installation tokens start with "ghs_" (installation token)
    // Personal Access Tokens start with "ghp_" (classic) or "github_pat_" (fine-grained)
    let authType = 'Personal Access Token';
    if (token.startsWith('ghs_')) {
      authType = 'GitHub App installation token';
    } else if (token.startsWith('github_pat_')) {
      authType = 'Fine-grained PAT';
    }

    const baseUrl = ghIntegration.config.apiBaseUrl;
    
    this.logger.info(`GitHub integration using ${authType} for ${hostname}/${repoSlug} (baseUrl: ${baseUrl || 'default'})`);

    return new Octokit({
      auth: token,
      baseUrl,
      userAgent: headers?.['user-agent'] || 'backstage-github-workflows-plugin',
      request: { headers },
    });
  }

  
  private parseRepo(githubRepoSlug: string): { repo: string; owner: string } {
    const parse = githubRepoSlug.split('/');
    return { owner: parse[0], repo: parse[1] };
  }

  private regexFileName(path: string): string {
    const parts = path.split('/');
    return parts[parts.length - 1];
  }

  /**
   * Wraps Octokit calls to catch errors and re-throw them as plain Error objects
   * This prevents Backstage's error serialization from accessing the deprecated error.code property
   */
  private async catchOctokitError<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error: any) {
      // Re-throw as a plain Error to avoid the deprecated error.code property
      const message = error.message || 'GitHub API request failed';
      const status = error.status || error.statusCode || 500;
      throw new Error(`GitHub API Error (${status}): ${message}`);
    }
  }

  async listWorkflows(
    hostname: string,
    githubRepoSlug: string,
    branch: string,
    filter?: string[],
  ): Promise<Workflows[]> {
    return this.catchOctokitError(async () => {
      const octokit = await this.getOctokit(hostname, githubRepoSlug);
      const { owner, repo } = this.parseRepo(githubRepoSlug);
      
      const response = await octokit.actions.listRepoWorkflows({
        owner,
        repo,
      });

      let workflows = response.data.workflows;
      
      // Exclude system workflows that shouldn't be manually triggered
      const excludedWorkflows = ['Dependabot Updates', 'CodeQL'];
      workflows = workflows.filter(workflow => 
        !excludedWorkflows.includes(workflow.name)
      );
      
      if (filter && filter.length > 0) {
        workflows = workflows.filter(workflow =>
          filter.includes(this.regexFileName(workflow.path)),
        );
      }

      // Get detailed information for each workflow
      const detailedWorkflows = await Promise.all(
        workflows.map(async (workflow) => {
          const latestRun = await this.getLatestWorkflowRun(hostname, workflow.id, githubRepoSlug);
          const dispatchParameters = await this.listWorkflowsDispatchParameters(
            hostname,
            githubRepoSlug,
            workflow.path,
            branch,
          );

          const latestWorkflowRunData = latestRun
            ? {
                id: latestRun.id,
                status: latestRun.status ?? undefined,
                conclusion: latestRun.conclusion ?? undefined,
              }
            : {
                status: 'completed',
                conclusion: 'failure',
              };

          return {
            workflow: {
              id: workflow.id,
              name: workflow.name,
              state: workflow.state,
              url: workflow.html_url,
              path: workflow.path,
              createdAt: workflow.created_at,
              updatedAt: workflow.updated_at,
            },
            latestRun: {
              ...latestWorkflowRunData,
              status: workflow.path.startsWith('dynamic/') ? 'action_required' : latestWorkflowRunData.status,
            },
            parameters: dispatchParameters,
          };
        }),
      );

      return detailedWorkflows;
    });
  }

  async listBranchesFromRepo(
    hostname: string,
    githubRepoSlug: string,
  ): Promise<RestEndpointMethodTypes['repos']['listBranches']['response']['data']> {
    return this.catchOctokitError(async () => {
      const octokit = await this.getOctokit(hostname, githubRepoSlug);
      const { owner, repo } = this.parseRepo(githubRepoSlug);

      const response = await octokit.rest.repos.listBranches({
        owner,
        repo,
      });
      return response.data;
    });
  }

  async getBranchDefaultFromRepo(
    hostname: string,
    githubRepoSlug: string,
  ): Promise<RestEndpointMethodTypes['repos']['get']['response']['data']['default_branch']> {
    return this.catchOctokitError(async () => {
      const octokit = await this.getOctokit(hostname, githubRepoSlug);
      const { owner, repo } = this.parseRepo(githubRepoSlug);
      
      const response = await octokit.rest.repos.get({
        owner,
        repo,
      });
      return response.data.default_branch;
    });
  }

  async startWorkflowRun(
    hostname: string,
    githubRepoSlug: string,
    workflowId: number,
    branch: string,
    inputs?: { [key: string]: unknown },
  ): Promise<RestEndpointMethodTypes['actions']['createWorkflowDispatch']['response']['status']> {
    return this.catchOctokitError(async () => {
      const octokit = await this.getOctokit(hostname, githubRepoSlug);
      const { owner, repo } = this.parseRepo(githubRepoSlug);
      const inputsParams = inputs || {};

      const totalWorkflowRunsBefore = await this.listWorkflowRunsTotalCount(
        hostname,
        githubRepoSlug,
        workflowId,
      );
      
      let totalWorkflowRunsAfter = totalWorkflowRunsBefore;
      const loadTime = 1500;

      const response = await octokit.actions.createWorkflowDispatch({
        owner,
        repo,
        workflow_id: workflowId,
        ref: branch,
        inputs: inputsParams,
      });

      // Wait for the workflow to start
      while (totalWorkflowRunsAfter === totalWorkflowRunsBefore) {
        await this.waitTime(loadTime);
        totalWorkflowRunsAfter = await this.listWorkflowRunsTotalCount(
          hostname,
          githubRepoSlug,
          workflowId,
        );
      }

      return response.status;
    });
  }

  async stopWorkflowRun(
    hostname: string,
    githubRepoSlug: string,
    runId: number,
  ): Promise<RestEndpointMethodTypes['actions']['cancelWorkflowRun']['response']['status']> {
    return this.catchOctokitError(async () => {
      const octokit = await this.getOctokit(hostname, githubRepoSlug);
      const { owner, repo } = this.parseRepo(githubRepoSlug);
      
      const response = await octokit.actions.cancelWorkflowRun({
        owner,
        repo,
        run_id: runId,
      });
      
      return response.status;
    });
  }

  async listJobsForWorkflowRun(
    hostname: string,
    githubRepoSlug: string,
    id: number,
    pageSize?: number,
    page?: number,
  ): Promise<RestEndpointMethodTypes['actions']['listJobsForWorkflowRun']['response']['data']> {
    return this.catchOctokitError(async () => {
      const octokit = await this.getOctokit(hostname, githubRepoSlug);
      const { owner, repo } = this.parseRepo(githubRepoSlug);
      
      const jobs = await octokit.actions.listJobsForWorkflowRun({
        owner,
        repo,
        run_id: id,
        per_page: pageSize,
        page,
      });
      
      return jobs.data;
    });
  }

  async getWorkflowRunById(
    hostname: string,
    githubRepoSlug: string,
    runId: number,
  ): Promise<RestEndpointMethodTypes['actions']['getWorkflowRun']['response']['data']> {
    return this.catchOctokitError(async () => {
      const octokit = await this.getOctokit(hostname, githubRepoSlug);
      const { owner, repo } = this.parseRepo(githubRepoSlug);
      
      const workflow = await octokit.actions.getWorkflowRun({
        owner,
        repo,
        run_id: runId,
      });
      
      return workflow.data;
    });
  }

  async downloadJobLogsForWorkflowRun(
    hostname: string,
    githubRepoSlug: string,
    jobId: number,
  ): Promise<RestEndpointMethodTypes['actions']['downloadJobLogsForWorkflowRun']['response']['data']> {
    return this.catchOctokitError(async () => {
      const octokit = await this.getOctokit(hostname, githubRepoSlug);
      const { owner, repo } = this.parseRepo(githubRepoSlug);
      
      const workflow = await octokit.actions.downloadJobLogsForWorkflowRun({
        owner,
        repo,
        job_id: jobId,
      });

      return workflow.data;
    });
  }

  async getEnvironmentsList(
    hostname: string,
    githubRepoSlug: string,
  ): Promise<RestEndpointMethodTypes['repos']['getAllEnvironments']['response']['data']> {
    return this.catchOctokitError(async () => {
      const octokit = await this.getOctokit(hostname, githubRepoSlug);
      const { owner, repo } = this.parseRepo(githubRepoSlug);
      
      const environments = await octokit.repos.getAllEnvironments({
        owner,
        repo,
      });
      
      return environments.data;
    });
  }

  private async waitTime(time: number): Promise<void> {
    return await new Promise(resolve => setTimeout(resolve, time));
  }

  private async getLatestWorkflowRun(
    hostname: string,
    workflowId: number,
    githubRepoSlug: string,
  ): Promise<RestEndpointMethodTypes['actions']['listWorkflowRuns']['response']['data']['workflow_runs'][0]> {
    const octokit = await this.getOctokit(hostname, githubRepoSlug);
    const { owner, repo } = this.parseRepo(githubRepoSlug);
    
    const response = await octokit.actions.listWorkflowRuns({
      owner,
      repo,
      workflow_id: workflowId,
    });

    return response.data.workflow_runs[0];
  }

  private async getFileContentFromPath(
    hostname: string,
    githubRepoSlug: string,
    filePath: string,
    branch: string,
  ): Promise<any> {
    const octokit = await this.getOctokit(hostname, githubRepoSlug);
    const { owner, repo } = this.parseRepo(githubRepoSlug);
    
    const response = await octokit.repos.getContent({
      owner,
      repo,
      path: filePath,
      ref: branch,
    });

    const data: GithubFileResponse = response.data as GithubFileResponse;

    const yamlContent = YAML.load(
      Buffer.from(data.content, 'base64').toString('utf8'),
    ) as any;

    return yamlContent;
  }

  private async listWorkflowsDispatchParameters(
    hostname: string,
    githubRepoSlug: string,
    filePath: string,
    branch: string,
  ): Promise<WorkflowDispatchParameters[]> {
    const dynamicWorkflow = filePath.startsWith('dynamic/');
    const yamlContent = dynamicWorkflow ? [] : await this.getFileContentFromPath(hostname, githubRepoSlug, filePath, branch);

    if (!yamlContent?.on?.workflow_dispatch?.inputs) return [];
    
    const inputs = yamlContent.on.workflow_dispatch.inputs;

    const mappedInputs: WorkflowDispatchParameters[] = Object.keys(inputs).map(
      input => {
        const currentInput = inputs[input];
        const result: WorkflowDispatchParameters = {
          name: input,
          description: currentInput.description ?? '',
          default: currentInput.default ?? '',
          required: currentInput.required ?? false,
          type: currentInput.type ?? 'string',
        };
        if (currentInput.type === 'choice') {
          result.options = currentInput.options;
        }
        return result;
      },
    );
    
    return mappedInputs;
  }

  private async listWorkflowRunsTotalCount(
    hostname: string,
    githubRepoSlug: string,
    workflowId: number,
  ): Promise<RestEndpointMethodTypes['actions']['listWorkflowRuns']['response']['data']['total_count']> {
    const octokit = await this.getOctokit(hostname, githubRepoSlug);
    const { owner, repo } = this.parseRepo(githubRepoSlug);
    
    const response = await octokit.actions.listWorkflowRuns({
      owner,
      repo,
      workflow_id: workflowId,
    });
    
    return response.data.total_count;
  }
}
