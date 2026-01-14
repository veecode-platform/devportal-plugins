import { createDevApp } from '@backstage/dev-utils';
import { dummyPlugin, DummyPage } from '../src/plugin';

createDevApp()
  .registerPlugin(dummyPlugin)
  .addPage({
    element: <DummyPage />,
    title: 'Root Page',
    path: '/dummy',
  })
  .render();
