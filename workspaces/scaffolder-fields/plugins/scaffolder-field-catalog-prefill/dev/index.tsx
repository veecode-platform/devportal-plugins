import { createDevApp } from '@backstage/dev-utils';
import {
  scaffolderFieldCatalogPrefillPlugin,
  ScaffolderFieldCatalogPrefillPage,
} from '../src/plugin';

createDevApp()
  .registerPlugin(scaffolderFieldCatalogPrefillPlugin)
  .addPage({
    element: <ScaffolderFieldCatalogPrefillPage />,
    title: 'Root Page',
    path: '/scaffolder-field-catalog-prefill',
  })
  .render();
