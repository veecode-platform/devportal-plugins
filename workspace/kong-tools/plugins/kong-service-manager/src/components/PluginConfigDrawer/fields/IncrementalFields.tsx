import { Box, Button, FormLabel, IconButton, TextField } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';

type IncrementalFieldsProps = {
  name: string;
  required: boolean;
  items: string[];
  onChange: (values: string[]) => void;
};

export function IncrementalFields({
  name,
  required,
  items,
  onChange,
}: IncrementalFieldsProps) {
  const handleChange = (index: number, value: string) => {
    const updated = [...items];
    updated[index] = value;
    onChange(updated);
  };

  const handleAdd = () => onChange([...items, '']);

  const handleRemove = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

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
      </FormLabel>

      {items.map((item, index) => (
        <Box key={index} display="flex" alignItems="center" gap={0.5} mb={0.5}>
          <TextField
            size="small"
            variant="outlined"
            fullWidth
            required={required}
            value={item}
            onChange={e => handleChange(index, e.target.value)}
          />
          <IconButton size="small" onClick={() => handleRemove(index)}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      ))}

      <Button
        size="small"
        variant="outlined"
        startIcon={<AddIcon />}
        onClick={handleAdd}
        sx={{ mt: 0.5 }}
      >
        Add
      </Button>
    </Box>
  );
}
