import { makeStyles } from '@material-ui/core';
import { HeaderComponent } from './headerComponent/HeaderComponent';
import { HomeGreeting } from './homeGretting/HomeGretting';
import { HomeContent } from './homeContent/HomeContent';
import { Page } from '@backstage/core-components';

const useVeeCodeHomePageStyles = makeStyles(theme => ({
  pageRoot: {
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: theme.palette.background.default,
  },
}));

export const VeeCodeHomePage = () => {
  const { pageRoot } = useVeeCodeHomePageStyles();
  return (
    <Page themeId="home" className={pageRoot}>
      <HeaderComponent />
      <HomeGreeting />
      <HomeContent />
    </Page>
  );
};
