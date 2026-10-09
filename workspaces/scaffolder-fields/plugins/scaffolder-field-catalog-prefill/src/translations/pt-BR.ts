import { createTranslationMessages } from '@backstage/core-plugin-api/alpha';
import { catalogEntityPrefillTranslationRef } from './ref';

export default createTranslationMessages({
  ref: catalogEntityPrefillTranslationRef,
  full: true,
  messages: {
    'status.loading': 'Carregando dados do catálogo…',
    'status.error':
      'Não foi possível carregar a entidade selecionada do catálogo. Selecione-a novamente ou escolha outra.',
  },
});
