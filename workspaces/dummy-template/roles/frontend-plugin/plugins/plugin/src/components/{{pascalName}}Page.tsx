import { Content, Header, Page } from '@backstage/core-components';

export const {{pascalName}}Page = () => (
  <Page themeId="home">
    <Header title="{{pascalName}} plugin" />
    <Content>
      <div data-testid="{{name}}-page">
        {{pascalName}} plugin is ready.
      </div>
    </Content>
  </Page>
);
