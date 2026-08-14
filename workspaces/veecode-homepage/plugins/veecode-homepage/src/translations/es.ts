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

const homepageTranslationEs = createTranslationMessages({
  ref: homepageTranslationRef,
  messages: {
    'greeting.welcome': 'Bienvenido de nuevo',
    'greeting.subtitle': 'Empecemos.',
    'summary.title': 'Resumen',
    'summary.resources': 'Recursos',
    'summary.components': 'Componentes',
    'summary.apis': 'APIs',
    'highlightedCard.title': 'Agregar nuevas funciones',
    'highlightedCard.createButton': 'Crear',
    'toolkit.docs': 'Documentación',
    'toolkit.community': 'Comunidad',
    'toolkit.website': 'Sitio web',
    'toolkit.support': 'Soporte',
    'visitedCharts.title': 'Más visitados',
    'visitedCharts.total': 'Total',
    'recentlyVisited.title': 'Visitados recientemente',
    'starredEntities.title': 'Tus entidades favoritas',
    'footer.poweredBy': 'Desarrollado con',
  },
});

export default homepageTranslationEs;
