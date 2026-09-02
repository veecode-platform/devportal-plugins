import React from 'react';
import Button from '@material-ui/core/Button';
import TextField from '@material-ui/core/TextField';
import Dialog from '@material-ui/core/Dialog';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogTitle from '@material-ui/core/DialogTitle';
import { Box, IconButton } from '@material-ui/core';
import RemoveIcon from '@material-ui/icons/Remove';
import AddIcon from '@material-ui/icons/Add';
import { PipelineVariable } from '@veecode-platform/gitlab-pipelines-common';
import { validateString } from '../../utils/validators';
import TextFieldComponent from './TextFieldComponent/TextFieldComponent';
import { useModalStyles } from './styles';
import { useGitlabPipelinesContext } from '../../context';
import { ModalComponentProps } from './types';
import { addJobParams } from '../../context/state';

export const ModalComponent: React.FC<ModalComponentProps> = props => {
  const [errorsState, setErrorsState] = React.useState<Record<string, boolean>>({});
  const [variables, setVariables] = React.useState<PipelineVariable[]>([
    { key: '', value: '' },
  ]);
  const classes = useModalStyles();
  const { jobParams, dispatchJobParams, dispatchVariablesParams } = useGitlabPipelinesContext();
  const {
    open,
    title,
    subtitle,
    onClose,
    onConfirm,
    handleModal,
    handleStartAction,
    modalType,
  } = props;
  const close = onClose ?? handleModal ?? (() => undefined);

  const handleChange = (
    event: React.ChangeEvent<{ name?: string | undefined; value: unknown }>,
    required: boolean,
    type: string | number | boolean,
  ) => {
    if (required) {
      if (type === 'string' && validateString(event.target.value as string)) {
        setErrorsState({ ...errorsState, [event.target.name!]: true });
      }
      if (event.target.value === '') {
        setErrorsState({ ...errorsState, [event.target.name!]: true });
      }
    }
    if (event && modalType === 'Job') {
      if (event.target.name === 'jobVariableKey') {
        dispatchJobParams(addJobParams({
          key: event.target.value as string,
          value: jobParams?.value ?? '',
        }));
        setErrorsState({ ...errorsState, [event.target.name!]: false });
      }
      if (event.target.name === 'jobVariableValue') {
        dispatchJobParams(addJobParams({
          key: jobParams?.key ?? '',
          value: event.target.value as string,
        }));
        setErrorsState({ ...errorsState, [event.target.name!]: false });
      }
    }
  };

  const touchedField = (
    event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement, Element>,
    required: boolean,
  ) => {
    if (required && event.target.value === '') {
      setErrorsState({ ...errorsState, [event.target.name!]: true });
    }
  };

  const handleVariableChange = (
    index: number,
    field: keyof PipelineVariable,
    value: string,
  ) => {
    setVariables(current =>
      current.map((variable, variableIndex) =>
        variableIndex === index ? { ...variable, [field]: value } : variable,
      ),
    );
  };

  const handleSetInputs = async () => {
    if (onConfirm) {
      const values = variables.filter(
        variable => variable.key !== '' || variable.value !== '',
      );
      close();
      await onConfirm(values);
      return;
    }

    close();
    if (handleStartAction) await handleStartAction();
  };

  const hasPartiallyFilledVariable = variables.some(variable => {
    const hasKey = variable.key.trim() !== '';
    const hasValue = variable.value.trim() !== '';
    return hasKey !== hasValue;
  });

  return (
    <Dialog open={open} onClose={close} aria-labelledby="form-dialog-title" maxWidth="lg" fullWidth>
      <DialogTitle id="form-dialog-title">{title}</DialogTitle>
      <DialogContent className={classes.modal}>
        <Box>{subtitle}</Box>
        <>
          {onConfirm && (
            <Box className={classes.InputField}>
              {variables.map((variable, index) => (
                <Box key={index} display="flex" alignItems="center">
                  <TextField
                    margin="dense"
                    name={`variable-key-${index}`}
                    label="key"
                    value={variable.key}
                    inputProps={{ 'aria-label': index === 0 ? 'key' : `key ${index + 1}` }}
                    onChange={event => handleVariableChange(index, 'key', event.target.value)}
                    fullWidth
                  />
                  <TextField
                    margin="dense"
                    name={`variable-value-${index}`}
                    label="value"
                    value={variable.value}
                    inputProps={{ 'aria-label': index === 0 ? 'value' : `value ${index + 1}` }}
                    onChange={event => handleVariableChange(index, 'value', event.target.value)}
                    fullWidth
                  />
                  {variables.length > 1 && (
                    <IconButton
                      aria-label={`remove variable ${index + 1}`}
                      onClick={() => setVariables(current => current.filter((_, variableIndex) => variableIndex !== index))}
                    >
                      <RemoveIcon />
                    </IconButton>
                  )}
                  <IconButton
                    aria-label={`add variable ${index + 1}`}
                    onClick={() => setVariables(current => [...current, { key: '', value: '' }])}
                  >
                    <AddIcon />
                  </IconButton>
                </Box>
              ))}
            </Box>
          )}

          {!onConfirm && modalType === 'Pipeline' && (
            <Box className={classes.InputField}>
              <TextFieldComponent
                setVariables={dispatchVariablesParams}
                setError={setErrorsState}
                errors={errorsState}
              />
            </Box>
          )}

          {!onConfirm && modalType === 'Job' && (
            <>
              <TextField
                margin="dense"
                id="jobVariableKey"
                name="jobVariableKey"
                defaultValue={jobParams?.key ?? ''}
                required
                label="Insert the variable name"
                type="string"
                fullWidth
                onBlur={event => touchedField(event, true)}
                onChange={event => handleChange(event, true, 'string')}
                error={errorsState.jobVariableKey}
                helperText={
                  errorsState.jobVariableKey ? 'use at least 3 characters' : null
                }
              />

              <TextField
                margin="dense"
                id="jobVariableValue"
                name="jobVariableValue"
                defaultValue={jobParams?.value ?? ''}
                required
                label="Insert the variable value"
                type="string"
                fullWidth
                onBlur={event => touchedField(event, true)}
                onChange={event => handleChange(event, true, 'string')}
                error={errorsState.jobVariableValue}
                helperText={
                  errorsState.jobVariableValue ? 'use at least 3 characters' : null
                }
              />
            </>
          )}
        </>
      </DialogContent>
      <DialogActions className={classes.footer}>
        <Button onClick={close} color="primary">
          Cancel
        </Button>
        <Button
          disabled={onConfirm ? hasPartiallyFilledVariable : Object.values(errorsState).some(error => error)}
          onClick={handleSetInputs}
          color="primary"
          variant="contained"
        >
          {onConfirm ? 'Run' : 'Submit'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
