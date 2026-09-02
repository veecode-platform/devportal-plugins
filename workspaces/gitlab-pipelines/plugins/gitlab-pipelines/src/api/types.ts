import { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';

export type Options = {
    discoveryApi: DiscoveryApi;
    fetchApi: FetchApi;
};
