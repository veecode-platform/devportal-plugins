/* eslint-disable no-restricted-syntax */
import {
  HomePageStarredEntities,
  HomePageToolkit,
  HomePageRecentlyVisited,
} from '@backstage/plugin-home';
import Grid from '@mui/material/Grid';
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

export const HomeContent = () => {
  const tools = [
    {
      url: 'https://docs.platform.vee.codes/',
      label: 'Docs',
      icon: <DocsLogo />,
    },
    {
      url: 'https://github.com/orgs/veecode-platform/discussions',
      label: 'Community',
      icon: <Communitylogo />,
    },
    {
      url: 'https://platform.vee.codes/',
      label: 'Website',
      icon: <WebsiteLogo />,
    },
    {
      url: 'https://veecode-suporte.freshdesk.com/support/login',
      label: 'Support',
      icon: <SupportLogo />,
    },
  ];

  return (
    <SearchContextProvider>
      <Content stretch>
        <Grid container spacing={2} justifyContent="center">
          {/* Top & Recently Visited */}
          <Grid item xs={12}>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6} lg={8}>
                <Grid container spacing={2} justifyContent="center">
                  <Grid item xs={12} md={12} lg={12}>
                    <Summary />
                  </Grid>
                  <Grid item xs={12} md={12} lg={12}>
                    <HomePageRecentlyVisited />
                  </Grid>
                  <Grid item xs={12} md={12} lg={12}>
                    <HomePageStarredEntities />
                  </Grid>
                </Grid>
              </Grid>
              <Grid item xs={12} md={6} lg={4}>
                <Grid container spacing={2} justifyContent="center">
                  <Grid item xs={12} md={12} lg={12}>
                    <PieAnimation />
                  </Grid>
                  <Grid item xs={12} md={12} lg={12}>
                    <HomePageToolkit tools={tools} />
                  </Grid>
                </Grid>
              </Grid>
            </Grid>
          </Grid>
          {/* Footer */}
          <Grid item xs={12} sx={{ marginTop: '7rem' }}>
            <Box
              sx={{
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
                Powered by
              </Typography>
              <img
                src={BackstageLogo}
                alt="backstage logo"
                style={{ width: '7.5em', height: '1.5em' }}
              />
            </Box>
          </Grid>
        </Grid>
      </Content>
    </SearchContextProvider>
  );
};
