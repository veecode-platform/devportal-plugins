import { createTranslationResource } from '@backstage/core-plugin-api/alpha';
import { kongServiceManagerTranslationRef } from './ref';

/**
 * Translation resource for the kong-service-manager plugin, providing
 * support for additional languages beyond the English default.
 *
 * @public
 */
export const kongServiceManagerTranslations = createTranslationResource({
  ref: kongServiceManagerTranslationRef,
  translations: {
    'pt-BR': () => import('./pt-BR'),
  },
});

export { kongServiceManagerTranslationRef, kongServiceManagerMessages } from './ref';
