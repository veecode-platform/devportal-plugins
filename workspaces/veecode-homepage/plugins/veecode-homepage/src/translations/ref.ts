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

import { createTranslationRef } from '@backstage/core-plugin-api/alpha';

// Export messages separately for testing
export const homepageMessages = {
  greeting: {
    welcome: 'Welcome back',
    subtitle: "Let's get started.",
  },
  summary: {
    title: 'Summary',
    resources: 'Resources',
    components: 'Components',
    apis: 'APIs',
  },
  highlightedCard: {
    title: 'Add new features',
    createButton: 'Create',
  },
  toolkit: {
    docs: 'Docs',
    community: 'Community',
    website: 'Website',
    support: 'Support',
  },
  visitedCharts: {
    title: 'Top Visited',
    total: 'Total',
  },
  recentlyVisited: {
    title: 'Recently Visited',
  },
  starredEntities: {
    title: 'Your Starred Entities',
  },
  footer: {
    poweredBy: 'Powered by',
  },
};

/**
 * Translation reference for the veecode-homepage plugin.
 *
 * @public
 */
export const homepageTranslationRef = createTranslationRef({
  id: 'plugin.veecode-homepage',
  messages: homepageMessages,
});
