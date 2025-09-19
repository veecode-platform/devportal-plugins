import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import { alpha } from '@mui/material/styles';

export type StatCardProps = {
  icon: React.ElementType;
  title: string;
  value: string;
  color: string;
};

export default function StatCard({
  icon: Icon,
  title,
  value,
  color,
}: StatCardProps) {
  return (
    <Card
      variant="outlined"
      sx={{
        width: '100%',
        height: '100%',
        flexGrow: 1,
        background: alpha(color, 0.15),
      }}
    >
      <CardContent>
        <Box
          component="div"
          sx={{
            display: 'flex',
            gap: '.5rem',
            padding: '.5rem 0',
          }}
        >
          <Icon color="secondary" style={{ fontSize: '18px' }} />
          <Typography component="h2" variant="subtitle1" gutterBottom>
            {title}
          </Typography>
        </Box>

        <Stack
          direction="row"
          sx={{
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Typography
            variant="h4"
            component="div"
            sx={{
              width: '100%',
              textAlign: 'right',
              padding: '0 .5rem',
            }}
          >
            {value}
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}
