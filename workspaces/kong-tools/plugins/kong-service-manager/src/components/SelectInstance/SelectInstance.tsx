import { useEffect } from 'react';
import {
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  type SelectChangeEvent,
} from '@mui/material';
import { useEntityAnnotations } from '../../hooks';
import { useKongServiceManager } from '../../context/KongServiceManagerContext';

export function SelectInstance() {
  const { instances } = useEntityAnnotations();
  const { state, setInstance } = useKongServiceManager();

  useEffect(() => {
    if (instances.length > 0 && !state.instance) {
      setInstance(instances[0]);
    }
  }, [instances, state.instance, setInstance]);

  if (instances.length <= 1) {
    return null;
  }

  const handleChange = (event: SelectChangeEvent) => {
    setInstance(event.target.value);
  };

  return (
    <FormControl size="small" sx={{ minWidth: 200, mb: 2 }}>
      <InputLabel id="kong-instance-label">Kong Instance</InputLabel>
      <Select
        labelId="kong-instance-label"
        value={state.instance}
        label="Kong Instance"
        onChange={handleChange}
      >
        {instances.map(inst => (
          <MenuItem key={inst} value={inst}>
            {inst}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
