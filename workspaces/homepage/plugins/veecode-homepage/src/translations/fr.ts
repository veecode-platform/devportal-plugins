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

const homepageTranslationFr = createTranslationMessages({
  ref: homepageTranslationRef,
  messages: {
    'greeting.welcome': 'Bon retour',
    'greeting.subtitle': 'Commençons.',
    'summary.title': 'Résumé',
    'summary.resources': 'Ressources',
    'summary.components': 'Composants',
    'summary.apis': 'APIs',
    'highlightedCard.title': 'Ajouter de nouvelles fonctionnalités',
    'highlightedCard.createButton': 'Créer',
    'toolkit.docs': 'Documentation',
    'toolkit.community': 'Communauté',
    'toolkit.website': 'Site web',
    'toolkit.support': 'Support',
    'visitedCharts.title': 'Les plus visités',
    'visitedCharts.total': 'Total',
    'recentlyVisited.title': 'Récemment visités',
    'starredEntities.title': 'Vos entités favorites',
    'footer.poweredBy': 'Propulsé par',
  },
});

export default homepageTranslationFr;
