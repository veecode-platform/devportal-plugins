import { createApiRef } from '@backstage/core-plugin-api';
import { BranchDto, JobDto, PipelineDto, PipelineVariable } from '@veecode-platform/gitlab-pipelines-common';

export const gitlabPipelinesApiRef = createApiRef<GitlabPipelinesApi>({ id: 'plugin.gitlab-pipelines.api' });

export interface GitlabPipelinesApi {
  listBranches(entityRef: string): Promise<BranchDto[]>;
  listPipelines(entityRef: string, ref?: string): Promise<PipelineDto[]>;
  getPipeline(entityRef: string, id: number): Promise<PipelineDto>;
  listJobs(entityRef: string, pipelineId: number): Promise<JobDto[]>;
  createPipeline(entityRef: string, ref: string, variables: PipelineVariable[]): Promise<PipelineDto>;
  retryPipeline(entityRef: string, id: number): Promise<PipelineDto>;
  cancelPipeline(entityRef: string, id: number): Promise<PipelineDto>;
  playJob(entityRef: string, jobId: number, variables: PipelineVariable[]): Promise<JobDto>;
  retryJob(entityRef: string, jobId: number): Promise<JobDto>;
  cancelJob(entityRef: string, jobId: number): Promise<JobDto>;
}
