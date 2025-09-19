import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import InsightsRoundedIcon from '@mui/icons-material/InsightsRounded';
import Box from '@mui/material/Box';
import { LinkButton } from '@backstage/core-components';
import { useTheme } from '@mui/material/styles';

export default function HighlightedCard() {
  const theme = useTheme();
  return (
    <Card
      variant="outlined"
      sx={{
        width: '100%',
        height: '100%',
        flexGrow: 1,
        border: '1px solid transparent',
        [theme.breakpoints.down('lg')]: {
          justifyContent: 'center',
          background: theme.palette.background.default,
        },
      }}
    >
      <CardContent>
        <Box
          component="div"
          sx={{
            display: 'flex',
            gap: '.5rem',
            padding: '.5rem 0',
            [theme.breakpoints.down('lg')]: {
              justifyContent: 'center',
            },
          }}
        >
          <InsightsRoundedIcon color="primary" />
          <Typography
            component="h2"
            variant="subtitle2"
            gutterBottom
            sx={{ fontWeight: '600' }}
          >
            Add new features
          </Typography>
        </Box>
        <Box
          sx={{
            [theme.breakpoints.down('lg')]: {
              textAlign: 'center',
            },
          }}
        >
          <LinkButton variant="contained" to="/create">
            {' '}
            <AddIcon /> Create
          </LinkButton>
        </Box>
      </CardContent>
    </Card>
  );
}
