import { scaffolderPlugin } from '@backstage/plugin-scaffolder';
import { createScaffolderFieldExtension } from '@backstage/plugin-scaffolder-react';
import { CatalogEntityPrefill } from './components/CatalogEntityPrefill';
import { CatalogEntityPrefillOptions, StepData } from './lib/options';
import { catalogEntityPrefillValidation } from './lib/pendingLoads';

export const CatalogEntityPrefillExtension = scaffolderPlugin.provide(
  createScaffolderFieldExtension<StepData, CatalogEntityPrefillOptions>({
    name: 'CatalogEntityPrefill',
    component: CatalogEntityPrefill,
    validation: catalogEntityPrefillValidation,
  }),
);
