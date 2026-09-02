import { createContext } from 'react';
import { Entity } from '@backstage/catalog-model';
import {
  Job,
  JobAnnotationProps,
  JobVariablesAttributes,
  Pipeline,
  VariablesParams,
} from '../utils/types';
import {
  JobsActionType,
  JobsAnnotationActionType,
  JobVariablesActionType,
  LatestPipelinesActionType,
  PipelinesActionType,
  VariablesActionType,
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
  variablesParams: VariablesParams[] | null;
  dispatchVariablesParams: React.Dispatch<VariablesActionType>;
  runNewPipeline: (variables: VariablesParams[]) => Promise<void>;
  retryPipeline: () => Promise<void>;
  cancelPipeline: () => Promise<void>;
  listJobs: (pipelineId: number) => Promise<Job[]>;
  allJobs: (pipelineId: number) => Promise<Job[] | null>;
  jobsListState: Job[] | null;
  jobsByAnnotation: JobAnnotationProps[] | null;
  dispatchJobsByAnnotation: React.Dispatch<JobsAnnotationActionType>;
  dispatchJobList: React.Dispatch<JobsActionType>;
  playJob: (jobId: number, variables: VariablesParams[]) => Promise<Job | null>;
  jobParams: JobVariablesAttributes | null;
  dispatchJobParams: React.Dispatch<JobVariablesActionType>;
  cancelJob: (jobId: number) => Promise<Job | null>;
  retryJob: (jobId: number) => Promise<Job | null>;
};

export const GitlabPipelinesContext = createContext<GitlabPipelinesContextType>(null!);
