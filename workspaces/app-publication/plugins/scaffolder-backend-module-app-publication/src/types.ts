import type { z } from 'zod/v3';
import type {
  deployOutput,
  failedJobOutput,
  lastDeployOutput,
  mergeRequestOutput,
  pieceOutput,
  pipelineOutput,
  statusOutput,
  waitOutput,
} from './outputs';

export type PieceOut = z.infer<ReturnType<typeof pieceOutput>>;
export type DeployOut = z.infer<ReturnType<typeof deployOutput>>;
export type FailedJob = z.infer<ReturnType<typeof failedJobOutput>>;
export type PipelineOut = z.infer<ReturnType<typeof pipelineOutput>>;
export type MergeRequestOut = z.infer<ReturnType<typeof mergeRequestOutput>>;
export type LastDeployOut = z.infer<ReturnType<typeof lastDeployOutput>>;
export type WaitOutput = z.infer<ReturnType<typeof waitOutput>>;
export type StatusOutput = z.infer<ReturnType<typeof statusOutput>>;
