import type { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';

export type KongInstance = {
  id: string;
  apiBaseUrl: string;
  workspace?: string;
  description?: string;
};

export async function fetchKongInstances(options: {
  discoveryApi: DiscoveryApi;
  fetchApi: FetchApi;
}): Promise<KongInstance[]> {
  const baseUrl = await options.discoveryApi.getBaseUrl(
    'kong-service-manager-backend',
  );
  const response = await options.fetchApi.fetch(`${baseUrl}/instances`);
  if (!response.ok) {
    throw new Error(`Failed to fetch Kong instances: ${response.status}`);
  }
  return response.json();
}
