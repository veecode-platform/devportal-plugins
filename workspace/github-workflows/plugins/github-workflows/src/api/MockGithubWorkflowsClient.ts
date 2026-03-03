import {
  GithubWorkflowsApi,
  Workflows,
  Branch,
  JobsResponse,
  WorkflowRun,
  EnvironmentsResponse,
} from '@veecode-platform/github-workflows-common';

/**
 * Mock implementation of GithubWorkflowsApi for frontend development and testing.
 * Returns realistic fixture data without making any HTTP calls.
 *
 * @public
 */
export class MockGithubWorkflowsClient implements GithubWorkflowsApi {
  async listWorkflows(
    _hostname: string,
    _githubRepoSlug: string,
    _branch: string,
    _filter?: string[],
  ): Promise<Workflows[]> {
    return [
      {
        workflow: {
          id: 1001,
          name: 'CI Build',
          state: 'active',
          url: 'https://github.com/mock-org/mock-repo/actions/workflows/ci.yml',
          path: '.github/workflows/ci.yml',
          createdAt: '2024-01-15T10:00:00Z',
          updatedAt: '2024-06-01T12:00:00Z',
        },
        latestRun: {
          id: 5001,
          status: 'completed',
          conclusion: 'success',
        },
        parameters: [],
      },
      {
        workflow: {
          id: 1002,
          name: 'Deploy',
          state: 'active',
          url: 'https://github.com/mock-org/mock-repo/actions/workflows/deploy.yml',
          path: '.github/workflows/deploy.yml',
          createdAt: '2024-01-20T08:00:00Z',
          updatedAt: '2024-06-10T14:00:00Z',
        },
        latestRun: {
          id: 5002,
          status: 'completed',
          conclusion: 'failure',
        },
        parameters: [
          {
            name: 'environment',
            description: 'Target environment',
            default: 'staging',
            required: true,
            type: 'choice',
            options: ['staging', 'production'],
          },
          {
            name: 'dry_run',
            description: 'Perform a dry run',
            default: 'false',
            required: false,
            type: 'boolean',
          },
        ],
      },
      {
        workflow: {
          id: 1003,
          name: 'Release',
          state: 'active',
          url: 'https://github.com/mock-org/mock-repo/actions/workflows/release.yml',
          path: '.github/workflows/release.yml',
          createdAt: '2024-02-01T09:00:00Z',
          updatedAt: '2024-06-15T16:00:00Z',
        },
        latestRun: {
          id: 5003,
          status: 'in_progress',
        },
        parameters: [
          {
            name: 'version',
            description: 'Release version',
            default: '',
            required: true,
            type: 'string',
          },
        ],
      },
    ];
  }

  async listBranchesFromRepo(
    _hostname: string,
    _githubRepoSlug: string,
  ): Promise<Branch[]> {
    return [
      { name: 'main', commit: { sha: 'abc1234', url: 'https://api.github.com/repos/mock-org/mock-repo/commits/abc1234' }, protected: true },
      { name: 'develop', commit: { sha: 'def5678', url: 'https://api.github.com/repos/mock-org/mock-repo/commits/def5678' }, protected: false },
      { name: 'feature/new-ui', commit: { sha: 'ghi9012', url: 'https://api.github.com/repos/mock-org/mock-repo/commits/ghi9012' }, protected: false },
    ];
  }

  async getBranchDefaultFromRepo(
    _hostname: string,
    _githubRepoSlug: string,
  ): Promise<string> {
    return 'main';
  }

  async startWorkflowRun(
    _hostname: string,
    _githubRepoSlug: string,
    _workflowId: number,
    _branch: string,
    _inputs?: { [key: string]: unknown },
  ): Promise<number> {
    return 204;
  }

  async stopWorkflowRun(
    _hostname: string,
    _githubRepoSlug: string,
    _runId: number,
  ): Promise<number> {
    return 202;
  }

  async listJobsForWorkflowRun(
    _hostname: string,
    _githubRepoSlug: string,
    _id: number,
    _pageSize?: number,
    _page?: number,
  ): Promise<JobsResponse> {
    return {
      total_count: 2,
      jobs: [
        {
          id: 8001,
          name: 'build',
          status: 'completed',
          conclusion: 'success',
          started_at: '2024-06-15T12:00:00Z',
          completed_at: '2024-06-15T12:05:00Z',
          html_url: 'https://github.com/mock-org/mock-repo/actions/runs/5001/job/8001',
          steps: [
            { name: 'Checkout', status: 'completed', conclusion: 'success', number: 1 },
            { name: 'Install', status: 'completed', conclusion: 'success', number: 2 },
            { name: 'Build', status: 'completed', conclusion: 'success', number: 3 },
            { name: 'Test', status: 'completed', conclusion: 'success', number: 4 },
          ],
        },
        {
          id: 8002,
          name: 'lint',
          status: 'completed',
          conclusion: 'success',
          started_at: '2024-06-15T12:00:00Z',
          completed_at: '2024-06-15T12:01:30Z',
          html_url: 'https://github.com/mock-org/mock-repo/actions/runs/5001/job/8002',
          steps: [
            { name: 'Checkout', status: 'completed', conclusion: 'success', number: 1 },
            { name: 'Lint', status: 'completed', conclusion: 'success', number: 2 },
          ],
        },
      ],
    };
  }

  async getWorkflowRunById(
    _hostname: string,
    _githubRepoSlug: string,
    runId: number,
  ): Promise<WorkflowRun> {
    return {
      id: runId,
      name: 'CI Build',
      head_branch: 'main',
      event: 'push',
      status: 'completed',
      conclusion: 'success',
      run_started_at: '2024-06-15T12:00:00Z',
      created_at: '2024-06-15T11:59:50Z',
      updated_at: '2024-06-15T12:05:00Z',
      actor: { id: 1, login: 'mock-user', avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4' },
      head_sha: 'abc1234567890',
      repository: { id: 100, name: 'mock-repo', full_name: 'mock-org/mock-repo' },
    };
  }

  async downloadJobLogsForWorkflowRun(
    _hostname: string,
    _githubRepoSlug: string,
    _jobId: number,
  ): Promise<string> {
    return [
      '2024-06-15T12:00:00Z  ##[group]Run actions/checkout@v4',
      '2024-06-15T12:00:01Z  Syncing repository: mock-org/mock-repo',
      '2024-06-15T12:00:05Z  ##[endgroup]',
      '2024-06-15T12:00:06Z  ##[group]Run npm install',
      '2024-06-15T12:00:30Z  added 1200 packages in 24s',
      '2024-06-15T12:00:30Z  ##[endgroup]',
      '2024-06-15T12:00:31Z  ##[group]Run npm test',
      '2024-06-15T12:01:00Z  Tests: 42 passed, 42 total',
      '2024-06-15T12:01:00Z  ##[endgroup]',
    ].join('\n');
  }

  async getEnvironmentsList(
    _hostname: string,
    _githubRepoSlug: string,
  ): Promise<EnvironmentsResponse> {
    return {
      total_count: 2,
      environments: [
        { id: 1, name: 'staging', node_id: 'EN_1', protection_rules: [], deployment_branch_policy: null },
        { id: 2, name: 'production', node_id: 'EN_2', protection_rules: [{ type: 'required_reviewers' }], deployment_branch_policy: null },
      ],
    };
  }
}
