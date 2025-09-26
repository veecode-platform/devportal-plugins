import { makeStyles } from '@mui/styles';
import { HeaderComponent } from './headerComponent/HeaderComponent';
import { HomeGreeting } from './homeGretting/HomeGretting';
import { HomeContent } from './homeContent/HomeContent';
import { Page } from '@backstage/core-components';
import Box from '@mui/material/Box';

const useVeeCodeHomePageStyles = makeStyles(theme => ({
  pageRoot: {
    backgroundColor: theme.palette.background.default,
  },
}));

export const VeeCodeHomePage = () => {
  const { pageRoot } = useVeeCodeHomePageStyles();
  return (
    <Page themeId="home" className={pageRoot}>
      <Box sx={{ 
        display: 'flex', 
        flexDirection: 'column', 
        width: '100%', 
        minHeight: '100vh' 
      }}>
        <HeaderComponent />
        <HomeGreeting />
        <HomeContent />
      </Box>
    </Page>
  );
};
