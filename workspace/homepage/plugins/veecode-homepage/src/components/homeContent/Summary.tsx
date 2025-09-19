// eslint-disable-next-line no-restricted-syntax
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Box from '@mui/material/Box';
import { CardHeader, Divider } from '@material-ui/core';
import StatCard from './StatCards';
import HighlightedCard from './HighLightedCard';
import { useCatalog } from '../../hooks/useCatalog';
import AutoAwesomeMotionIcon from '@mui/icons-material/AutoAwesomeMotion';
import FolderCopyIcon from '@mui/icons-material/FolderCopy';
import ExtensionIcon from '@mui/icons-material/Extension';
import { useTheme } from '@mui/material/styles';
import { configApiRef, useApi } from '@backstage/core-plugin-api';
import { generateColorVariants } from '../../utils/generateColor';

export default function Summary() {
  const { resources, apis, components } = useCatalog();
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';
  const configApi = useApi(configApiRef);

  const data = [
    {
      icon: AutoAwesomeMotionIcon,
      title: 'Resources',
      value: resources.length.toString(),
    },
    {
      icon: FolderCopyIcon,
      title: 'Components',
      value: components.length.toString(),
    },
    {
      icon: ExtensionIcon,
      title: 'APIs',
      value: apis.length.toString(),
    },
  ];

  const color =
    (isDarkMode
      ? configApi.app?.branding?.theme?.dark?.headerColor1
      : // ? configApi.getOptionalString('app.branding.theme.dark.headerColo1')
        // : configApi.getOptionalString('app.branding.theme.light.headerColo1')) ??
        configApi.app?.branding?.theme?.light?.headerColor1) ?? '#45556D';
  const colors = generateColorVariants(color, data.length);

  return (
    <Card
      variant="outlined"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        flexGrow: 1,
        overfloyY: 'auto',
      }}
    >
      <CardHeader title="Summary" />
      <Divider />
      <CardContent>
        <Box
          sx={{
            display: 'grid',
            alignItems: 'center',
            gap: '1rem',
            gridTemplateColumns: 'repeat(4,1fr)',
            [theme.breakpoints.down('lg')]: {
              gridTemplateColumns: '1fr',
            },
          }}
        >
          {data.map((card, index) => (
            <StatCard key={index} {...card} color={colors[index]} />
          ))}
          <HighlightedCard />
        </Box>
      </CardContent>
    </Card>
  );
}
