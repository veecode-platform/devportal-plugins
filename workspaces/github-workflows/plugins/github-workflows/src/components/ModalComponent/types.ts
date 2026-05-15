import { SelectChangeEvent } from "@mui/material/Select";
import { WorkflowDispatchParameters } from "../../utils/types";

export type EnvironmentFieldProps = {
    name: string;
    description: string;
    value: string | null;
    defaultValue: string | boolean;
    required: boolean;
    onSelect: (event: SelectChangeEvent<any>) => void,
    onTouch: (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement, Element>, required: boolean) => void
  }

export type ModalComponentProps = {
    open: boolean,
    handleModal: () => void,
    parameters: WorkflowDispatchParameters[],
    handleStartWorkflow?: () => Promise<void>
  }
  