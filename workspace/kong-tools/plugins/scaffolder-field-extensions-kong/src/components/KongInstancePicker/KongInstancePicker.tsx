import useAsync from 'react-use/esm/useAsync';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';
import FormHelperText from '@mui/material/FormHelperText';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import type { FieldExtensionComponentProps } from '@backstage/plugin-scaffolder-react';
import { fetchKongInstances, type KongInstance } from '../../api/fetchInstances';

export default function KongInstancePicker(
  props: FieldExtensionComponentProps<string>,
) {
  const { onChange, rawErrors, required, formData, schema } = props;
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);

  const {
    value: instances = [],
    loading,
    error,
  } = useAsync(() => fetchKongInstances({ discoveryApi, fetchApi }), []);

  const selected = instances.find(i => i.id === formData) ?? null;

  return (
    <>
      <Autocomplete<KongInstance, false>
        options={instances}
        value={selected}
        loading={loading}
        getOptionLabel={option => option.id}
        isOptionEqualToValue={(option, val) => option.id === val.id}
        onChange={(_event, value) => onChange(value?.id ?? undefined)}
        renderOption={(optionProps, option) => (
          <li {...optionProps} key={option.id}>
            <div>
              <strong>{option.id}</strong>
              <br />
              <small>{option.apiBaseUrl}</small>
              {option.workspace && <small> ({option.workspace})</small>}
            </div>
          </li>
        )}
        renderInput={params => (
          <TextField
            {...params}
            label={schema.title ?? 'Kong Instance'}
            required={required}
            error={!!rawErrors?.length || !!error}
            helperText={schema.description}
            InputProps={{
              ...params.InputProps,
              endAdornment: (
                <>
                  {loading && <CircularProgress size={20} />}
                  {params.InputProps.endAdornment}
                </>
              ),
            }}
          />
        )}
      />
      {error && (
        <FormHelperText error>
          Failed to load Kong instances: {error.message}
        </FormHelperText>
      )}
    </>
  );
}
