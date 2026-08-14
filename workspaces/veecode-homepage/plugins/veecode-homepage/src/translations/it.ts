/*
 * Copyright 2024 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { createTranslationMessages } from '@backstage/core-plugin-api/alpha';
import { homepageTranslationRef } from './ref';

const homepageTranslationIt = createTranslationMessages({
  ref: homepageTranslationRef,
  messages: {
    'greeting.welcome': 'Bentornato',
    'greeting.subtitle': 'Iniziamo.',
    'summary.title': 'Riepilogo',
    'summary.resources': 'Risorse',
    'summary.components': 'Componenti',
    'summary.apis': 'API',
    'highlightedCard.title': 'Aggiungi nuove funzionalità',
    'highlightedCard.createButton': 'Crea',
    'toolkit.docs': 'Documentazione',
    'toolkit.community': 'Comunità',
    'toolkit.website': 'Sito web',
    'toolkit.support': 'Supporto',
    'visitedCharts.title': 'Più visitati',
    'visitedCharts.total': 'Totale',
    'recentlyVisited.title': 'Visitati di recente',
    'starredEntities.title': 'Le tue entità preferite',
    'footer.poweredBy': 'Sviluppato con',
  },
});

export default homepageTranslationIt;
