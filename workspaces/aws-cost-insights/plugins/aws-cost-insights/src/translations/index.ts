import { createTranslationResource } from '@backstage/core-plugin-api/alpha';
import { costInsightsTranslationRef } from './ref';

export const costInsightsTranslations = createTranslationResource({
  ref: costInsightsTranslationRef,
  translations: {
    pt: () => import('./pt'),
  },
});

export { costInsightsTranslationRef };
