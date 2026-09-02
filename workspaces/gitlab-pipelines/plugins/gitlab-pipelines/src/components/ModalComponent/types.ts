import { ReactNode } from 'react';
import { PipelineVariable } from '@veecode-platform/gitlab-pipelines-common';

export type ModalComponentProps = {
  open: boolean;
  title: string;
  subtitle?: ReactNode;
  onClose?: () => void;
  onConfirm?: (variables: PipelineVariable[]) => void | Promise<void>;

  // Legacy props are kept for callers that still use the context-backed modal.
  modalType?: 'Pipeline' | 'Job';
  handleModal?: () => void;
  handleStartAction?: () => Promise<void>;
};
