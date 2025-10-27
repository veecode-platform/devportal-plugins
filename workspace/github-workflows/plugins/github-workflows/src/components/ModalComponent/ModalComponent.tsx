import { useState, useEffect, ChangeEvent, FocusEvent } from 'react';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Checkbox from '@mui/material/Checkbox';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import { validateString } from '../../utils/validators';
import { useGithuWorkflowsContext } from '../../context';
import { useModalStyles } from './styles';
import EnvironmentFieldComponent from './EnvironmentFieldComponent';
import { ModalComponentProps } from './types';


export const ModalComponent = ({open, handleModal, parameters, handleStartWorkflow }:ModalComponentProps) => {

   const [inputWorkflow, setInputWorkflow] = useState<Record<string, any>>({});
  const [errorsState, setErrorsState] = useState<Record<string, boolean>>({});
  const {modal,label,formControl,footer} = useModalStyles();
  const { setInputParams, inputsParamsState } = useGithuWorkflowsContext();

  const handleChange = (event: ChangeEvent<{ name?: string | undefined; value: unknown; }>, required: boolean, type: string | number | boolean) : void => {
    if(event){
      // Always update the input value first
      setInputWorkflow({...inputWorkflow, [event.target.name!]: event.target.value});
      
      // Then validate and set error state
      if(required){
        if(type === "string" && validateString(event.target.value as string)){
          setErrorsState({...errorsState, [event.target.name!] : true });
          return;
        }
        if(event.target.value === "") {
          setErrorsState({...errorsState, [event.target.name!] : true });
          return;
        }
      }
      
      // Clear error state if validation passes
      setErrorsState({...errorsState, [event.target.name!] : false });
    }
    return;
  };

  const handleStateCheckbox = (event: ChangeEvent<HTMLInputElement>) => {
    if(event){
      const isChecked = event.target.checked;
      setInputWorkflow({ ...inputWorkflow, [event.target.name]: isChecked });
    };
  };

  const touchedField = (event: FocusEvent<HTMLInputElement | HTMLTextAreaElement, Element>, required: boolean) => {
    if (required && event.target.value === "") setErrorsState({ ...errorsState, [event.target.name!]: true })
    return;
  }

  const handleSetInputs = () => {
    setInputParams(inputWorkflow);
    handleModal();
    if (handleStartWorkflow) {
      handleStartWorkflow();
    }
  }

  const handleChangeSelect = (event: SelectChangeEvent<any>) => {
   if(event){
     setInputWorkflow({...inputWorkflow, [event.target.name]: event.target.value})
   }
  };

  useEffect(() => {
    const data: any = {};
    parameters.forEach(p => {
      data[p.name] = p.default;
    });
    setInputWorkflow(data);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])  

  useEffect(()=>{
    if (inputsParamsState) {
      setInputWorkflow(inputsParamsState)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[inputsParamsState])

  return (
      <Dialog open={open} onClose={handleModal} aria-labelledby="form-dialog-title">
        <DialogTitle id="form-dialog-title">Workflows Parameters</DialogTitle>
        <DialogContent className={modal}>
          <DialogContentText>
          Fill in the fields according to the values set in the project workflow.
          </DialogContentText>
          {
            parameters.map(p => (
              <div key={p.name }>
              {p.type === "string" && (
                <TextField
                  margin="dense"
                  id={p.name}
                  name={p.name}
                  value={inputWorkflow[p.name] ?? p.default}
                  required={p.required as boolean}
                  label={p.description}
                  type="string"
                  fullWidth
                  onBlur={(event) => touchedField(event, p.required)}
                  onChange={(event) => handleChange(event, p.required, p.type)}
                  error={errorsState[p.name]}
                    helperText={
                      errorsState[p.name]
                        ? 'use at least 3 characters'
                        : null
                    }
              />
              )}
              {p.type === "number" && (
                <TextField
                  margin="dense"
                  id={p.name}
                  name={p.name}
                  value={inputWorkflow[p.name] ?? p.default}
                  required={p.required as boolean}
                  label={p.description}
                  onBlur={(event) => touchedField(event, p.required)}
                  type="number"
                  fullWidth
                  onChange={(event) => handleChange(event, p.required, p.type)}
              />
              )}
              {p.type === "choice" && (
                  <FormControl variant="outlined" className={formControl} >
                    <InputLabel className={label} id={p.name}>{p.description}</InputLabel>
                    <Select
                      labelId={p.name}
                      id="select-outlined"
                      defaultValue={p.default}
                      value={inputWorkflow[p.name] ?? p.default}
                      variant="filled"
                      onChange={handleChangeSelect}
                      label={p.description}
                      required={p.required as boolean}
                      name={p.name}
                      onBlur={(event) => touchedField(event, p.required)}
                    >
                      {p.options?.map(o => (
                        <MenuItem value={o} key={o}>
                          <em>{o}</em>
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
              )}
               {p.type === "environment" && (
                  <EnvironmentFieldComponent
                    name={p.name}
                    description={p.description}
                    defaultValue={p.default}
                    value={inputWorkflow[p.name] ?? p.default}
                    required={p.required}
                    onSelect={handleChangeSelect}
                    onTouch={touchedField}
                  />
              )}
              {p.type === "boolean" && (
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={Boolean(inputWorkflow[p.name]) ?? Boolean(p.default)}
                      onChange={handleStateCheckbox}
                      name={p.name}
                      color="primary"
                      required={p.required as boolean}
                    />
                  }
                  label={p.description}
                />
              )}
              </div>
            ))
          }
        </DialogContent>
        <DialogActions className={footer}>
          <Button onClick={handleModal} color="primary">
            Cancel
          </Button>
          <Button
            disabled={Object.values(errorsState).some((error) => error)}
            onClick={handleSetInputs}
            color="primary"
            >
            Submit
          </Button>
        </DialogActions>
      </Dialog>
  );
}
