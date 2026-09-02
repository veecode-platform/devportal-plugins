import { ReactNode } from 'react';
import { PipelineVariable } from '@veecode-platform/gitlab-pipelines-common';

export type ModalComponentProps = {
  open: boolean;
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  onConfirm: (variables: PipelineVariable[]) => void | Promise<void>;
};
