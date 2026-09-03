import {
  configApiRef,
  createApiFactory,
  createPlugin,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/core-plugin-api';
import { rootRouteRef } from './routes';
import { costInsightsApiRef } from '@backstage-community/plugin-cost-insights';
import { CostExplorerClient } from './api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';

export const awsCostInsightsPlugin = createPlugin({
  id: 'aws-cost-insights',
  routes: {
    root: rootRouteRef,
  },
  apis: [
    createApiFactory({
      api: costInsightsApiRef,
      deps: {
        configApi: configApiRef,
        fetchApi: fetchApiRef,
        discoveryApi: discoveryApiRef,
        catalogApi: catalogApiRef,
      },
      factory: ({ discoveryApi, fetchApi, catalogApi }) => {
        return new CostExplorerClient(discoveryApi, fetchApi, catalogApi);
      },
    }),
  ],
});

export const costInsightsAwsPlugin = awsCostInsightsPlugin;
