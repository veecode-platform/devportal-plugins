
/**
 * Shared types for GitHub Workflows plugin
 * @public
 */

// From backend GithubWorkflowsService.ts
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

// Plain types to replace Octokit types
export interface Branch {
  name: string;
  commit?: {
    sha: string;
    url: string;
  };
  protected: boolean;
}

export interface JobsResponse {
  total_count: number;
  jobs: Job[];
}

export interface Job {
  id: number;
  name: string;
  status: string;
  conclusion?: string;
  started_at: string;
  completed_at?: string;
  html_url?: string;
  steps?: Step[];
}

export interface Step {
  name: string;
  status: string;
  conclusion?: string;
  number: number;
  started_at?: string;
  completed_at?: string;
}

export interface WorkflowRun {
  id: number;
  name: string;
  head_branch: string;
  event: string;
  status: string;
  conclusion?: string;
  run_started_at: string;
  created_at: string;
  updated_at: string;
  actor?: {
    id: number;
    login: string;
    avatar_url: string;
  };
  path?: string;
  artifacts_url?: string;
  head_sha?: string;
  repository?: {
    id: number;
    name: string;
    full_name: string;
  };
}

export interface EnvironmentsResponse {
  total_count: number;
  environments: Environment[];
}

export interface Environment {
  id: number;
  name: string;
  node_id: string;
  protection_rules?: any[];
  deployment_branch_policy?: any;
}

// From frontend utils/types/index.ts
export interface Workflow {
  id: number;
  nodeId: string;
  name: string;
  path: string;
  state: string;
  createdAt: string;
  updatedAt: string;
  url: string;
  html_url: string;
  badgeUrl: string;
}

export interface WorkflowResponseFromApi {
  total_count: number;
  workflows: Workflow[];
}

export interface WorkflowRunsResponseFromApi {
  total_count: number;
  workflow_runs: WorkflowRun[];
}

export interface WorkflowResultsProps {
  id?: number;
  name?: string;
  lastRunId?: number;
  status?: string;
  conclusion?: string;
  source?: string;
  path?: string;
  parameters?: WorkflowDispatchParameters[] | [];
}

export interface Actor {
  id: number;
  login: string;
  avatar_url: string;
}

export interface Repository {
  id: number;
  name: string;
  full_name: string;
}

export interface Commit {
  sha: string;
  url: string;
}

export interface Protection {
  required_status_checks: {
    enforcement_level: string;
    contexts: string[];
  };
}

export interface WorkflowAnnotation {
  workflow: string;
  label?: string;
  tooltip?: string;
}