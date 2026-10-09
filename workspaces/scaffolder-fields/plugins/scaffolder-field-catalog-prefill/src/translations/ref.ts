import { createTranslationRef } from '@backstage/core-plugin-api/alpha';

export const catalogEntityPrefillMessages = {
  status: {
    loading: 'Loading data from the catalog…',
    error:
      'Could not load the selected catalog entity. Select it again or choose another one.',
  },
};

export const catalogEntityPrefillTranslationRef = createTranslationRef({
  id: 'catalog-entity-prefill',
  messages: catalogEntityPrefillMessages,
});
