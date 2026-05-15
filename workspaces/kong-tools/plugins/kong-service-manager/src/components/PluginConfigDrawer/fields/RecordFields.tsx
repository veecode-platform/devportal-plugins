import { useCallback, useState } from 'react';
import {
  Accordion,
  AccordionActions,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  FormLabel,
  IconButton,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SaveIcon from '@mui/icons-material/Save';
import type { ConfigField } from './parseSchemaFields';
import { IncrementalFields } from './IncrementalFields';

type RecordFieldsProps = {
  name: string;
  required: boolean;
  items: Record<string, unknown>[];
  recordFields: ConfigField[];
  onChange: (values: Record<string, unknown>[]) => void;
};

function RecordSubField({
  field,
  value,
  onChange,
}: {
  field: ConfigField;
  value: unknown;
  onChange: (val: unknown) => void;
}) {
  // Array of strings inside a record (e.g. tags)
  if (field.type === 'array' && field.arrayElementType === 'string') {
    const arrVal = Array.isArray(value) ? (value as string[]) : [];
    return (
      <IncrementalFields
        name={field.name}
        required={field.required}
        items={arrVal}
        onChange={onChange}
      />
    );
  }

  // Select from oneOf options
  if (field.oneOf && field.oneOf.length > 0) {
    return (
      <TextField
        select
        size="small"
        label={field.name}
        fullWidth
        required={field.required}
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        sx={{ mb: 1 }}
      >
        {field.oneOf.map(opt => (
          <MenuItem key={String(opt)} value={String(opt)}>
            {String(opt)}
          </MenuItem>
        ))}
      </TextField>
    );
  }

  // Number
  if (field.type === 'number') {
    return (
      <TextField
        size="small"
        type="number"
        label={field.name}
        fullWidth
        required={field.required}
        value={value ?? ''}
        onChange={e => onChange(Number(e.target.value))}
        sx={{ mb: 1 }}
      />
    );
  }

  // Default: string
  return (
    <TextField
      size="small"
      label={field.name}
      fullWidth
      required={field.required}
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      sx={{ mb: 1 }}
    />
  );
}

export function RecordFields({
  name,
  required,
  items,
  recordFields,
  onChange,
}: RecordFieldsProps) {
  const [newItem, setNewItem] = useState<Record<string, unknown>>({});

  const handleEdit = useCallback(
    (index: number, key: string, value: unknown) => {
      const updated = [...items];
      updated[index] = { ...updated[index], [key]: value };
      onChange(updated);
    },
    [items, onChange],
  );

  const handleDelete = useCallback(
    (index: number) => {
      onChange(items.filter((_, i) => i !== index));
    },
    [items, onChange],
  );

  const handleAddSave = useCallback(() => {
    onChange([...items, newItem]);
    setNewItem({});
  }, [items, newItem, onChange]);

  return (
    <Box sx={{ mb: 2, width: '100%' }}>
      <FormLabel
        sx={{
          fontWeight: 'bold',
          fontSize: 'body2.fontSize',
          mb: 1,
          display: 'block',
        }}
      >
        config.{name}
        {required && ' *'}
      </FormLabel>

      {items.map((item, index) => (
        <Accordion key={index} variant="outlined" sx={{ mb: 0.5 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box display="flex" alignItems="center" justifyContent="space-between" width="100%">
              <Typography variant="body2">
                {name} [{index}]
              </Typography>
              <IconButton
                size="small"
                color="error"
                onClick={e => {
                  e.stopPropagation();
                  handleDelete(index);
                }}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Box display="flex" flexDirection="column" gap={1} width="100%">
              {recordFields.map(rf => (
                <RecordSubField
                  key={rf.name}
                  field={rf}
                  value={item[rf.name]}
                  onChange={val => handleEdit(index, rf.name, val)}
                />
              ))}
            </Box>
          </AccordionDetails>
        </Accordion>
      ))}

      {/* New item form */}
      <Accordion variant="outlined" sx={{ mt: 0.5 }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="body2" color="primary">
            New Item
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Box display="flex" flexDirection="column" gap={1} width="100%">
            {recordFields.map(rf => (
              <RecordSubField
                key={rf.name}
                field={rf}
                value={newItem[rf.name]}
                onChange={val =>
                  setNewItem(prev => ({ ...prev, [rf.name]: val }))
                }
              />
            ))}
          </Box>
        </AccordionDetails>
        <AccordionActions>
          <Button
            size="small"
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={handleAddSave}
          >
            Add
          </Button>
        </AccordionActions>
      </Accordion>

      <Button
        size="small"
        variant="outlined"
        startIcon={<AddIcon />}
        onClick={() =>
          onChange([...items, {}])
        }
        sx={{ mt: 1 }}
      >
        Add Empty
      </Button>
    </Box>
  );
}
