import React from 'react';
import { errorApiRef, useApi } from '@backstage/core-plugin-api';
import { useEntity } from '@backstage/plugin-catalog-react';
import { PipelineVariable } from '@veecode-platform/gitlab-pipelines-common';
import { GitlabPipelinesContext } from './GitlabPipelinesContext';
import { Job, Pipeline } from '../utils/types';
import { gitlabPipelinesApiRef } from '../api';
import { useEntityAnnotations } from '../hooks';
import {
  addJobs,
  addLatestPipeline,
  addPipelines,
  initialJobsAnnotationState,
  initialJobsState,
  initialJobParamsState,
  initialLatestPipelineState,
  initialPipelinesState,
  initialVariableParamsState,
  JobsAnnotationReducer,
  JobsReducer,
  JobParamsReducer,
  LatestPipelineReducer,
  PipelinesReducer,
  VariablesParamsReducer,
} from './state';

interface GitlabPipelinesProviderProps {
  children: React.ReactNode;
}

export const GitlabPipelinesProvider: React.FC<GitlabPipelinesProviderProps> = ({ children }) => {
  const [branch, setBranch] = React.useState<string>('');
  const [pipelineListState, dispatchPipelines] = React.useReducer(
    PipelinesReducer,
    initialPipelinesState,
  );
  const [latestPipelineState, dispachLatestPipeline] = React.useReducer(
    LatestPipelineReducer,
    initialLatestPipelineState,
  );
  const [jobsListState, dispatchJobList] = React.useReducer(
    JobsReducer,
    initialJobsState,
  );
  const [jobsByAnnotation, dispatchJobsByAnnotation] = React.useReducer(
    JobsAnnotationReducer,
    initialJobsAnnotationState,
  );
  const [variablesParams, dispatchVariablesParams] = React.useReducer(
    VariablesParamsReducer,
    initialVariableParamsState,
  );
  const [jobParams, dispatchJobParams] = React.useReducer(
    JobParamsReducer,
    initialJobParamsState,
  );
  const { entity } = useEntity();
  const { projectName, entityRef, jobsAnnotations } = useEntityAnnotations(entity);
  const api = useApi(gitlabPipelinesApiRef);
  const errorApi = useApi(errorApiRef);

  const setBranchState = (branchName: string) => {
    setBranch(branchName);
  };

  const listAllPipelines = async (): Promise<Pipeline[] | null> => {
    try {
      const pipelines = await api.listPipelines(entityRef, branch);
      if (pipelines.length > 0) {
        dispatchPipelines(addPipelines(pipelines));
        dispachLatestPipeline(addLatestPipeline(pipelines[0]));
        return pipelines;
      }
      return null;
    } catch (e: any) {
      errorApi.post(e);
      return null;
    }
  };

  const latestPipeline = async (): Promise<Pipeline | null> => {
    try {
      const pipelines = await api.listPipelines(entityRef, branch);
      const pipeline = pipelines[0];
      if (pipeline) {
        dispachLatestPipeline(addLatestPipeline(pipeline));
        return pipeline;
      }
      return null;
    } catch (e: any) {
      errorApi.post(e);
      return null;
    }
  };

  const runNewPipeline = async (variables: PipelineVariable[]): Promise<void> => {
    try {
      const response = await api.createPipeline(entityRef, branch, variables);
      if (response.status === 'created') {
        dispachLatestPipeline(addLatestPipeline(response));
        await listAllPipelines();
      }
    } catch (e: any) {
      errorApi.post(e);
    }
  };

  const retryPipeline = async (): Promise<void> => {
    try {
      const pipelineId = latestPipelineState?.id;
      if (pipelineId === undefined) return;
      const response = await api.retryPipeline(entityRef, pipelineId);
      if (response.id) {
        dispachLatestPipeline(addLatestPipeline(response));
        await listAllPipelines();
      }
    } catch (e: any) {
      errorApi.post(e);
    }
  };

  const cancelPipeline = async (): Promise<void> => {
    try {
      const pipelineId = latestPipelineState?.id;
      if (pipelineId === undefined) return;
      const response = await api.cancelPipeline(entityRef, pipelineId);
      if (response.id) {
        dispachLatestPipeline(addLatestPipeline(response));
        await listAllPipelines();
      }
    } catch (e: any) {
      errorApi.post(e);
    }
  };

  const listJobs = async (pipelineId: number): Promise<Job[]> => {
    try {
      return await api.listJobs(entityRef, pipelineId);
    } catch (e: any) {
      errorApi.post(e);
      return [];
    }
  };

  const allJobs = async (pipelineId: number): Promise<Job[] | null> => {
    const response = await listJobs(pipelineId);
    if (response.length > 0) {
      const jobs = response.filter(job => job.allowFailure);
      dispatchJobList(addJobs(jobs));
      return jobs;
    }
    return null;
  };

  const playJob = async (
    jobId: number,
    variables: PipelineVariable[],
  ): Promise<Job | null> => {
    try {
      return await api.playJob(entityRef, jobId, variables);
    } catch (e: any) {
      errorApi.post(e);
      return null;
    }
  };

  const cancelJob = async (jobId: number): Promise<Job | null> => {
    try {
      return await api.cancelJob(entityRef, jobId);
    } catch (e: any) {
      errorApi.post(e);
      return null;
    }
  };

  const retryJob = async (jobId: number): Promise<Job | null> => {
    try {
      return await api.retryJob(entityRef, jobId);
    } catch (e: any) {
      errorApi.post(e);
      return null;
    }
  };

  return (
    <GitlabPipelinesContext.Provider
      value={{
        branch,
        jobsAnnotations,
        projectName,
        entityRef,
        entity,
        setBranchState,
        listAllPipelines,
        pipelineListState,
        dispatchPipelines,
        latestPipeline,
        latestPipelineState,
        dispachLatestPipeline,
        variablesParams,
        dispatchVariablesParams,
        runNewPipeline,
        retryPipeline,
        cancelPipeline,
        listJobs,
        allJobs,
        jobsListState,
        jobsByAnnotation,
        dispatchJobsByAnnotation,
        dispatchJobList,
        playJob,
        jobParams,
        dispatchJobParams,
        cancelJob,
        retryJob,
      }}
    >
      {children}
    </GitlabPipelinesContext.Provider>
  );
};

export const useGitlabPipelinesContext = () => React.useContext(GitlabPipelinesContext);
