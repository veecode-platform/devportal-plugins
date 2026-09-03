export type PipelineStatus =
  | 'created' | 'waiting_for_resource' | 'preparing' | 'pending' | 'running'
  | 'success' | 'failed' | 'canceled' | 'skipped' | 'manual' | 'scheduled';

export interface BranchDto { name: string; default: boolean; protected: boolean }

export interface PipelineDto {
  id: number;
  projectId: number;
  ref: string;
  sha: string;
  status: PipelineStatus;
  source: string;
  webUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface JobDto {
  id: number;
  name: string;
  stage: string;
  status: PipelineStatus;
  manual: boolean;          // status === 'manual'
  allowFailure: boolean;
  webUrl: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface PipelineVariable { key: string; value: string }
export interface CreatePipelineRequest { ref: string; variables?: PipelineVariable[] }
export interface PlayJobRequest { variables?: PipelineVariable[] }
