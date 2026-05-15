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

const homepageTranslationDe = createTranslationMessages({
  ref: homepageTranslationRef,
  messages: {
    'greeting.welcome': 'Willkommen zurück',
    'greeting.subtitle': 'Lass uns anfangen.',
    'summary.title': 'Zusammenfassung',
    'summary.resources': 'Ressourcen',
    'summary.components': 'Komponenten',
    'summary.apis': 'APIs',
    'highlightedCard.title': 'Neue Funktionen hinzufügen',
    'highlightedCard.createButton': 'Erstellen',
    'toolkit.docs': 'Dokumentation',
    'toolkit.community': 'Community',
    'toolkit.website': 'Webseite',
    'toolkit.support': 'Support',
    'visitedCharts.title': 'Meistbesuchte',
    'visitedCharts.total': 'Gesamt',
    'recentlyVisited.title': 'Kürzlich besucht',
    'starredEntities.title': 'Ihre markierten Entitäten',
    'footer.poweredBy': 'Bereitgestellt von',
  },
});

export default homepageTranslationDe;
