import { Grid } from '@material-ui/core';
import {
  Header,
  Page,
  Content,
  ContentHeader,
  HeaderLabel,
  SupportButton,
} from '@backstage/core-components';
import { DummyFetchComponent } from '../DummyFetchComponent';

export const DummyComponent = () => (
  <Page themeId="tool">
    <Header title="Welcome to dummy!" subtitle="Optional subtitle">
      <HeaderLabel label="Owner" value="Team X" />
      <HeaderLabel label="Lifecycle" value="Alpha" />
    </Header>
    <Content>
      <ContentHeader title="Dummy Plugin">
        <SupportButton>A description of your plugin goes here.</SupportButton>
      </ContentHeader>
      <Grid container spacing={3} direction="column">
        <Grid item>
          <DummyFetchComponent />
        </Grid>
      </Grid>
    </Content>
  </Page>
);
