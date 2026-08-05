import {
  ApiBlueprint,
  AppRootElementBlueprint,
  createFrontendModule,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/frontend-plugin-api';
import { compatWrapper } from '@backstage/core-compat-api';

import { pendingChangesApiRef, PendingChangesClient } from './api';
import { PendingChangesButton } from './components/PendingChangesButton/PendingChangesButton';

/**
 * NFS API extension providing the same {@link PendingChangesClient}
 * implementation the OFS plugin registers via `createApiFactory` in
 * `./plugin`.
 *
 * @alpha
 */
export const pendingChangesApi = ApiBlueprint.make({
  name: 'pending-changes',
  params: defineParams =>
    defineParams({
      api: pendingChangesApiRef,
      deps: { discoveryApi: discoveryApiRef, fetchApi: fetchApiRef },
      factory: ({ discoveryApi, fetchApi }) =>
        new PendingChangesClient({ discoveryApi, fetchApi }),
    }),
});

/**
 * Renders the Pending Changes badge/popover at the app root, outside of
 * the page layout, instead of a page or nav item of its own (decision
 * D-G6: Pending Changes is a small NFS module for the stock header, not
 * a page). `layout` pins it to a fixed position so it behaves like a
 * persistent header item regardless of which route is active.
 *
 * @alpha
 */
export const pendingChangesRootElement = AppRootElementBlueprint.make({
  name: 'pending-changes-button',
  params: {
    element: compatWrapper(
      <PendingChangesButton
        layout={{ position: 'fixed', top: 8, right: 96, zIndex: 1201 }}
      />,
    ),
  },
});

/**
 * NFS module that extends the host `app` plugin with the Pending Changes
 * indicator. Targets `pluginId: 'app'` rather than declaring a
 * `createFrontendPlugin` of its own, matching the pattern
 * `devportal-marketplace-frontend`'s own translations module uses for
 * the same reason: this augments the shell, it isn't a plugin page.
 * Named `appModule<Name>` per the `createFrontendModule` naming
 * recommendation (`appModulePublicSignIn` in `@backstage/plugin-app`).
 *
 * @alpha
 */
const appModulePendingChanges = createFrontendModule({
  pluginId: 'app',
  extensions: [pendingChangesApi, pendingChangesRootElement],
});

export default appModulePendingChanges;
