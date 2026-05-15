import { Header, Page, TabbedLayout } from '@backstage/core-components'
import { AboutTab } from './AboutTab';
import { SupportTab } from './SupportTab';

export const DefaultAboutPage = () => {
  return (
    <Page themeId="tool">
      <Header title="About" subtitle=""> </Header>
        <TabbedLayout>
        <TabbedLayout.Route path="/" title="Info">
          <AboutTab />
        </TabbedLayout.Route>
        <TabbedLayout.Route path="/support" title="Support">
          <SupportTab />
        </TabbedLayout.Route>
        </TabbedLayout>
    </Page>
  )
}
