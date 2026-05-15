import { createApiRef } from '@backstage/core-plugin-api';
import type { KongServiceManagerApi } from '@veecode-platform/backstage-plugin-kong-service-manager-common';

/** API ref for the Kong Service Manager frontend client */
export const kongServiceManagerApiRef = createApiRef<KongServiceManagerApi>({
  id: 'plugin.kong-service-manager.service',
});
