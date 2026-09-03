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
import { useModalStyles } from './styles';
import { ModalComponentProps } from './types';

export const ModalComponent: React.FC<ModalComponentProps> = props => {
  const [variables, setVariables] = React.useState<PipelineVariable[]>([
    { key: '', value: '' },
  ]);
  const classes = useModalStyles();
  const { open, title, subtitle, onClose, onConfirm } = props;

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
    const values = variables.filter(
      variable => variable.key !== '' || variable.value !== '',
    );
    onClose();
    await onConfirm(values);
  };

  const hasPartiallyFilledVariable = variables.some(variable => {
    const hasKey = variable.key.trim() !== '';
    const hasValue = variable.value.trim() !== '';
    return hasKey !== hasValue;
  });

  return (
    <Dialog open={open} onClose={onClose} aria-labelledby="form-dialog-title" maxWidth="lg" fullWidth>
      <DialogTitle id="form-dialog-title">{title}</DialogTitle>
      <DialogContent className={classes.modal}>
        <Box>{subtitle}</Box>
        <>
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
        </>
      </DialogContent>
      <DialogActions className={classes.footer}>
        <Button onClick={onClose} color="primary">
          Cancel
        </Button>
        <Button
          disabled={hasPartiallyFilledVariable}
          onClick={handleSetInputs}
          color="primary"
          variant="contained"
        >
          Run
        </Button>
      </DialogActions>
    </Dialog>
  );
};
