// eslint-disable-next-line no-restricted-syntax
import * as React from 'react';
import { PieChart } from '@mui/x-charts/PieChart';
import { useDrawingArea } from '@mui/x-charts/hooks';
import { styled, useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import LinearProgress from '@mui/material/LinearProgress';
import { CardHeader, Divider } from '@mui/material';
import { useApi, configApiRef } from '@backstage/core-plugin-api';
import { useVisited } from '../../hooks/useVisited';
import { generateColorVariants } from '../../utils/generateColor';
import TurnedInNotIcon from '@mui/icons-material/TurnedInNot';
import { useTranslation } from '../../hooks/useTranslation';

interface StyledTextProps {
  variant: 'primary' | 'secondary';
}

const StyledText = styled('text', {
  shouldForwardProp: prop => prop !== 'variant',
})<StyledTextProps>(({ theme }) => ({
  textAnchor: 'middle',
  dominantBaseline: 'central',
  fill: theme.palette.text.secondary,
  variants: [
    {
      props: {
        variant: 'primary',
      },
      style: {
        fontSize: theme.typography.h5.fontSize,
      },
    },
    {
      props: ({ variant }) => variant !== 'primary',
      style: {
        fontSize: theme.typography.body2.fontSize,
      },
    },
    {
      props: {
        variant: 'primary',
      },
      style: {
        fontWeight: theme.typography.h5.fontWeight,
      },
    },
    {
      props: ({ variant }) => variant !== 'primary',
      style: {
        fontWeight: theme.typography.body2.fontWeight,
      },
    },
  ],
}));

interface PieCenterLabelProps {
  primaryText: string;
  secondaryText: string;
}

function PieCenterLabel({ primaryText, secondaryText }: PieCenterLabelProps) {
  const { width, height, left, top } = useDrawingArea();
  const primaryY = top + height / 2 - 10;
  const secondaryY = primaryY + 24;

  return (
    <React.Fragment>
      <StyledText variant="primary" x={left + width / 2} y={primaryY}>
        {primaryText}
      </StyledText>
      <StyledText variant="secondary" x={left + width / 2} y={secondaryY}>
        {secondaryText}
      </StyledText>
    </React.Fragment>
  );
}

export default function VisitedCharts() {
  const { total, items, visits } = useVisited();
  const { t } = useTranslation();
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';
  const configApi = useApi(configApiRef);
  const color =
    (isDarkMode
      ? configApi.app?.branding?.theme?.dark?.headerColor1
      : // ? configApi.getOptionalString('app.branding.theme.dark.headerColo1')
        // : configApi.getOptionalString('app.branding.theme.light.headerColo1')) ??
        configApi.app?.branding?.theme?.light?.headerColor1) ?? '#45556D';
  const colors = generateColorVariants(color, items.length);
  const calculatePercent = (value: number) => {
    const percent = value / (total / 100);
    return Number(percent.toFixed(2));
  };

  return (
    <Card
      variant="outlined"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        flexGrow: 1,
        maxHeight: '900px',
        overfloyY: 'auto',
      }}
    >
      <CardHeader title={t('visitedCharts.title')} />
      <Divider />
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <PieChart
            colors={colors}
            margin={{
              left: 80,
              right: 80,
              top: 80,
              bottom: 80,
            }}
            series={[
              {
                data: items,
                innerRadius: 75,
                outerRadius: 100,
                paddingAngle: 0,
                highlightScope: { fade: 'global', highlight: 'item' },
              },
            ]}
            height={260}
            width={260}
            hideLegend
          >
            <PieCenterLabel primaryText={`${total}`} secondaryText={t('visitedCharts.total')} />
          </PieChart>
        </Box>
      </CardContent>
      <Box
        sx={{ padding: '2rem', background: theme.palette.background.default }}
      >
        {visits.map(visit => (
          <Stack
            key={visit.id}
            direction="row"
            sx={{ alignItems: 'center', gap: 2, pb: 2 }}
          >
            <TurnedInNotIcon />
            <Stack sx={{ gap: 1, flexGrow: 1 }}>
              <Stack
                direction="row"
                sx={{
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 2,
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: '500' }}>
                  {visit.name}
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {calculatePercent(visit.hits)}%
                </Typography>
              </Stack>
              <LinearProgress
                variant="determinate"
                aria-label="Number of users by country"
                value={calculatePercent(visit.hits)}
              />
            </Stack>
          </Stack>
        ))}
      </Box>
    </Card>
  );
}
