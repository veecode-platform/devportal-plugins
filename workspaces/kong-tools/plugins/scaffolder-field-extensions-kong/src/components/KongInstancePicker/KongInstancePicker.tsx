import useAsync from 'react-use/esm/useAsync';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';
import FormHelperText from '@mui/material/FormHelperText';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
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
        getOptionLabel={option =>
          option.description ? `${option.id} (${option.description})` : option.id
        }
        isOptionEqualToValue={(option, val) => option.id === val.id}
        onChange={(_event, value) => onChange(value?.id ?? undefined)}
        renderOption={(optionProps, option) => (
          <Box
            component="li"
            {...optionProps}
            key={option.id}
            sx={{
              py: 1,
              px: 2,
              cursor: 'pointer',
              transition: 'background-color 0.15s',
              '&:hover': { bgcolor: 'action.hover' },
            }}
          >
            <Box>
              <Typography variant="body1" component="span">
                <strong>{option.id}</strong>
                {option.description && (
                  <Typography
                    variant="body2"
                    component="span"
                    sx={{ color: 'text.secondary', ml: 1 }}
                  >
                    ({option.description})
                  </Typography>
                )}
              </Typography>
              <Typography variant="caption" display="block" sx={{ color: 'text.secondary' }}>
                {option.apiBaseUrl}
                {option.workspace && ` / ${option.workspace}`}
              </Typography>
            </Box>
          </Box>
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
