/* eslint-disable no-restricted-syntax */
import {
  HomePageStarredEntities,
  HomePageToolkit,
  HomePageRecentlyVisited,
} from '@backstage/plugin-home';
import { SearchContextProvider } from '@backstage/plugin-search-react';
import { Content } from '@backstage/core-components';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Communitylogo from '../../assets/Community';
import DocsLogo from '../../assets/Docs';
import WebsiteLogo from '../../assets/Website';
import SupportLogo from '../../assets/Support';
import BackstageLogo from '../../assets/backstage.png';
import PieAnimation from './VisitedCharts';
import Summary from './Summary';
import { useTranslation } from '../../hooks/useTranslation';

export const HomeContent = () => {
  const { t } = useTranslation();

  const tools = [
    {
      url: 'https://docs.platform.vee.codes/',
      label: t('toolkit.docs'),
      icon: <DocsLogo />,
    },
    {
      url: 'https://github.com/orgs/veecode-platform/discussions',
      label: t('toolkit.community'),
      icon: <Communitylogo />,
    },
    {
      url: 'https://platform.vee.codes/',
      label: t('toolkit.website'),
      icon: <WebsiteLogo />,
    },
    {
      url: 'https://veecode-suporte.freshdesk.com/support/login',
      label: t('toolkit.support'),
      icon: <SupportLogo />,
    },
  ];

  return (
    <SearchContextProvider>
      <Content stretch>
        {/* Spacing comes from gap, not Grid: Grid spacing pads items through a
            `.MuiGrid-item` selector, which misses when another plugin changes the
            class prefix of the MUI copy the host shares. */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Top & Recently Visited */}
          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: {
                xs: 'minmax(0, 1fr)',
                md: 'repeat(2, minmax(0, 1fr))',
                lg: 'minmax(0, 2fr) minmax(0, 1fr)',
              },
            }}
          >
            <Box sx={{ display: 'grid', gap: 2, alignContent: 'start' }}>
              <Summary />
              <HomePageRecentlyVisited title={t('recentlyVisited.title')} />
              <HomePageStarredEntities title={t('starredEntities.title')} />
            </Box>
            <Box sx={{ display: 'grid', gap: 2, alignContent: 'start' }}>
              <PieAnimation />
              <HomePageToolkit tools={tools} />
            </Box>
          </Box>
          {/* Footer */}
          <Box
            sx={{
              marginTop: '7rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.3em',
              gap: '10px',
            }}
          >
            <Typography
              sx={{
                fontSize: '1.2em',
                fontWeight: 'bold',
              }}
            >
              {t('footer.poweredBy')}
            </Typography>
            <img
              src={BackstageLogo}
              alt="backstage logo"
              style={{ width: '7.5em', height: '1.5em' }}
            />
          </Box>
        </Box>
      </Content>
    </SearchContextProvider>
  );
};
