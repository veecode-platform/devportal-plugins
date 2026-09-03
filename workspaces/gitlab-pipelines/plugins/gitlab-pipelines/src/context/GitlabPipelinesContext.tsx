import { createContext } from 'react';
import { Entity } from '@backstage/catalog-model';
import { PipelineVariable } from '@veecode-platform/gitlab-pipelines-common';
import {
  Job,
  JobAnnotationProps,
  Pipeline,
} from '../utils/types';
import {
  JobsAnnotationActionType,
  LatestPipelinesActionType,
  PipelinesActionType,
} from './state';

export type GitlabPipelinesContextType = {
  branch: string | null;
  jobsAnnotations: JobAnnotationProps[] | null;
  projectName: string;
  entityRef: string;
  entity: Entity;
  setBranchState: (branch: string) => void;
  listAllPipelines: () => Promise<Pipeline[] | null>;
  pipelineListState: Pipeline[] | null;
  dispatchPipelines: React.Dispatch<PipelinesActionType>;
  latestPipeline: () => Promise<Pipeline | null>;
  latestPipelineState: Pipeline | null;
  dispachLatestPipeline: React.Dispatch<LatestPipelinesActionType>;
  runNewPipeline: (variables: PipelineVariable[]) => Promise<void>;
  retryPipeline: () => Promise<void>;
  cancelPipeline: () => Promise<void>;
  listJobs: (pipelineId: number) => Promise<Job[]>;
  jobsByAnnotation: JobAnnotationProps[] | null;
  dispatchJobsByAnnotation: React.Dispatch<JobsAnnotationActionType>;
  playJob: (jobId: number, variables: PipelineVariable[]) => Promise<Job | null>;
  cancelJob: (jobId: number) => Promise<Job | null>;
  retryJob: (jobId: number) => Promise<Job | null>;
};

export const GitlabPipelinesContext = createContext<GitlabPipelinesContextType>(null!);
