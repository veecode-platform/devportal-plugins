import {
  createApiFactory,
  //  createComponentExtension,
  createPlugin,
  createRoutableExtension,
  identityApiRef,
  storageApiRef,
} from '@backstage/core-plugin-api';
import {
  // type StarredEntitiesProps,
  // type VisitedByTypeProps,
  // type FeaturedDocsCardProps,
  visitsApiRef,
  VisitsStorageApi,
} from '@backstage/plugin-home';

import { rootRouteRef } from './routes';
import { homepageTranslationRef } from './translations';

// Secure-context fallback: `crypto.randomUUID()` only exists on HTTPS/localhost
// origins. On plain-HTTP deployments (local mirrors, air-gapped, tailnet IPs)
// it is undefined and the upstream visits storage (`@backstage/plugin-home`
// VisitsStorageApi.save) throws, so "Recently/Top visited" never records. Add a
// small RFC-4122 v4 fallback (crypto.getRandomValues IS available on HTTP) at
// plugin init so the plugin works on any origin.
if (
  typeof window !== 'undefined' &&
  window.crypto &&
  typeof window.crypto.randomUUID !== 'function'
) {
  window.crypto.randomUUID = () => {
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
    const hex = [...bytes].map(b => b.toString(16).padStart(2, '0'));
    return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
  };
}

console.log('[veecode-homepage] Initializing plugin');

export const veecodeHomepagePlugin = createPlugin({
  id: 'veecode-homepage',
  routes: {
    root: rootRouteRef,
  },
  apis: [
    createApiFactory({
      api: visitsApiRef,
      deps: {
        storageApi: storageApiRef,
        identityApi: identityApiRef,
      },
      factory: ({ storageApi, identityApi }) => {
        console.log('[veecode-homepage] Creating VisitsStorageApi');
        return VisitsStorageApi.create({ storageApi, identityApi });
      },
    }),
  ],
  __experimentalTranslations: {
    availableLanguages: ['en', 'de', 'es', 'fr', 'it', 'pt'],
    resources: [homepageTranslationRef],
  },
} as any);

export const VeecodeHomepagePage = veecodeHomepagePlugin.provide(
  createRoutableExtension({
    name: 'c',
    component: () => {
      console.log('[veecode-homepage] Loading VeeCodeHomePage component');
      return import('./components/VeeCodeHomePage').then(m => m.VeeCodeHomePage);
    },
    mountPoint: rootRouteRef,
  }),
);

/**
 * Translation resource for the veecode-homepage plugin
 *
 * @public
 */
export { homepageTranslations } from './translations';
