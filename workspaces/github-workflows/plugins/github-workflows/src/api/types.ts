import { DiscoveryApi } from '@backstage/core-plugin-api';

// Import all types from common package
export type { 
  Workflows,
  WorkflowDispatchParameters,
  GithubFileResponse,
  Branch,
  JobsResponse,
  Job,
  Step,
  WorkflowRun,
  EnvironmentsResponse,
  Environment,
  Workflow,
  WorkflowResponseFromApi,
  WorkflowRunsResponseFromApi,
  WorkflowResultsProps,
  Actor,
  Repository,
  Commit,
  Protection,
  WorkflowAnnotation
} from '@veecode-platform/github-workflows-common';

export type Integrations = {
 host: string,
 [key:string]: string | number | boolean
}

export type Options = {
  discoveryApi: DiscoveryApi;
}