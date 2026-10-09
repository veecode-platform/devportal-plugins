import { createTranslationResource } from '@backstage/core-plugin-api/alpha';
import { catalogEntityPrefillTranslationRef } from './ref';

export const catalogEntityPrefillTranslations = createTranslationResource({
  ref: catalogEntityPrefillTranslationRef,
  translations: {
    'pt-BR': () => import('./pt-BR'),
  },
});

export {
  catalogEntityPrefillMessages,
  catalogEntityPrefillTranslationRef,
} from './ref';
