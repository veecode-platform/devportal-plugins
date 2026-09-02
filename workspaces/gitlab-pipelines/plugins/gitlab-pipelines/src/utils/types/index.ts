import type { BranchDto, JobDto, PipelineDto } from '@veecode-platform/gitlab-pipelines-common';
import { GitlabPipelinesStatus } from '../enums/GitlabPipelinesStatus';

export type { BranchDto, JobDto, PipelineDto, PipelineVariable } from '@veecode-platform/gitlab-pipelines-common';
export type {
  PipelineDto as PipelineListResponse,
  JobDto as ListJobsResponse,
  BranchDto as ListBranchResponse,
  PipelineVariable as VariablesParams,
} from '@veecode-platform/gitlab-pipelines-common';

export type Pipeline = PipelineDto;
export type Job = JobDto;
export type Branch = BranchDto;

export interface JobAnnotationProps {
  id: string;
  label: string;
  tooltip: string;
  var: string;
  status: GitlabPipelinesStatus;
}
