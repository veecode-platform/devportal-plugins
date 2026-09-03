import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { TestApiProvider, mockApis } from '@backstage/test-utils';
import {
  discoveryApiRef,
  fetchApiRef,
  errorApiRef,
  DiscoveryApi,
  FetchApi,
  ErrorApi,
} from '@backstage/core-plugin-api';
import { translationApiRef } from '@backstage/core-plugin-api/alpha';
import {
  costInsightsApiRef,
  CostInsightsApi,
} from '@backstage-community/plugin-cost-insights';
import { CleanEntityCostCard } from './CleanEntityCostCard';

// Polyfill ResizeObserver for recharts ResponsiveContainer in JSDOM
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as any;

const mockEntity: import('@backstage/catalog-model').Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: 'test-service',
    namespace: 'default',
    annotations: {
      'backstage.io/kubernetes-namespace': 'test-namespace',
      'aws.amazon.com/cost-insights-tags': 'Name=test-service',
    },
  },
};

// Mutable so the no-annotation test can swap the entity without re-mocking the module
let currentEntity = mockEntity;

jest.mock('@backstage/plugin-catalog-react', () => ({
  useEntity: () => ({ entity: currentEntity }),
}));

describe('CleanEntityCostCard State Machine', () => {
  const mockDiscoveryApi = {
    getBaseUrl: jest.fn().mockResolvedValue('http://localhost:7007/api/proxy'),
  } as unknown as DiscoveryApi;

  const mockErrorApi = {
    post: jest.fn(),
    error$: jest.fn(),
  } as unknown as ErrorApi;

  const sampleAwsCost = {
    id: 'test-service',
    aggregation: [
      { date: '2026-09-01', amount: 10 },
      { date: '2026-09-02', amount: 10 },
    ],
    groupedCosts: {
      service: [
        {
          id: 'AmazonEC2',
          aggregation: [
            { date: '2026-09-01', amount: 10 },
            { date: '2026-09-02', amount: 10 },
          ],
        },
      ],
    },
  };

  beforeEach(() => {
    expect(React).toBeDefined();
    jest.clearAllMocks();
    currentEntity = mockEntity;
  });

  it('renders setup hint and queries nothing when the entity has no cost annotation', async () => {
    currentEntity = {
      ...mockEntity,
      metadata: {
        ...mockEntity.metadata,
        annotations: {
          'backstage.io/kubernetes-namespace': 'test-namespace',
        },
      },
    };
    const mockClient = {
      getCatalogEntityDailyCost: jest.fn(),
    };
    const mockFetchApi = { fetch: jest.fn() };

    render(
      <TestApiProvider
        apis={[
          [translationApiRef, mockApis.translation()],
          [errorApiRef, mockErrorApi],
          [costInsightsApiRef, mockClient as unknown as CostInsightsApi],
          [discoveryApiRef, mockDiscoveryApi],
          [fetchApiRef, mockFetchApi as unknown as FetchApi],
        ]}
      >
        <CleanEntityCostCard />
      </TestApiProvider>,
    );

    expect(screen.getByTestId('no-annotation-info')).toBeInTheDocument();
    expect(screen.queryByTestId('tco-banner')).toBeNull();
    expect(mockClient.getCatalogEntityDailyCost).not.toHaveBeenCalled();
    expect(mockFetchApi.fetch).not.toHaveBeenCalled();
  });

  it('renders loading state when initial requests are pending', async () => {
    const mockClient = {
      getCatalogEntityDailyCost: jest.fn(() => new Promise(() => {})),
    };
    const mockFetchApi = {
      fetch: jest.fn(() => new Promise(() => {})),
    };

    render(
      <TestApiProvider
        apis={[
          [translationApiRef, mockApis.translation()],
          [errorApiRef, mockErrorApi],
          [costInsightsApiRef, mockClient as unknown as CostInsightsApi],
          [discoveryApiRef, mockDiscoveryApi],
          [fetchApiRef, mockFetchApi as unknown as FetchApi],
        ]}
      >
        <CleanEntityCostCard />
      </TestApiProvider>,
    );

    const banner = screen.getByTestId('tco-banner');
    expect(banner).toHaveTextContent(/Calculating consolidated costs.../i);
  });

  it('renders available state with consolidated TCO when both AWS and K8s succeed', async () => {
    const mockClient = {
      getCatalogEntityDailyCost: jest.fn().mockResolvedValue(sampleAwsCost as any),
    };
    const mockFetchApi = {
      fetch: jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: [
            {
              'test-namespace': {
                name: 'test-namespace',
                cpuCost: 0.5,
                ramCost: 0.5,
                totalCost: 1.0, // $1.00/day * 30.5 = $30.50/mo
              },
            },
          ],
        }),
      }),
    };

    render(
      <TestApiProvider
        apis={[
          [translationApiRef, mockApis.translation()],
          [errorApiRef, mockErrorApi],
          [costInsightsApiRef, mockClient as unknown as CostInsightsApi],
          [discoveryApiRef, mockDiscoveryApi],
          [fetchApiRef, mockFetchApi as unknown as FetchApi],
        ]}
      >
        <CleanEntityCostCard />
      </TestApiProvider>,
    );

    await waitFor(() => {
      const banner = screen.getByTestId('tco-banner');
      expect(banner).toHaveTextContent(/Consolidated Monthly TCO \(AWS Cloud \+ Kubernetes\)/i);
    });

    const banner = screen.getByTestId('tco-banner');
    // AWS daily avg is 10 -> AWS monthly = 10 * 30.5 = 305.00
    // K8s daily = 1.0 -> K8s monthly = 30.50
    // Total = 335.50
    expect(banner).toHaveTextContent('$335.50');
    expect(banner).toHaveTextContent('$305.00 AWS Cloud + $30.50 Kubernetes Workload');
  });

  it('renders cloud-only state when K8s workload is not applicable', async () => {
    const mockClient = {
      getCatalogEntityDailyCost: jest.fn().mockResolvedValue(sampleAwsCost as any),
    };
    const mockFetchApi = {
      fetch: jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: [
            {
              'unrelated-namespace': {
                name: 'unrelated-namespace',
                totalCost: 5.0,
              },
            },
          ],
        }),
      }),
    };

    render(
      <TestApiProvider
        apis={[
          [translationApiRef, mockApis.translation()],
          [errorApiRef, mockErrorApi],
          [costInsightsApiRef, mockClient as unknown as CostInsightsApi],
          [discoveryApiRef, mockDiscoveryApi],
          [fetchApiRef, mockFetchApi as unknown as FetchApi],
        ]}
      >
        <CleanEntityCostCard />
      </TestApiProvider>,
    );

    await waitFor(() => {
      const banner = screen.getByTestId('tco-banner');
      expect(banner).toHaveTextContent(/Monthly Cloud Cost \(AWS Cloud\)/i);
    });

    const banner = screen.getByTestId('tco-banner');
    expect(banner).toHaveTextContent('$305.00');
    expect(banner).toHaveTextContent(/No in-cluster workload/i);
  });

  it('renders cloud-only with warning subtext when K8s proxy fails', async () => {
    const mockClient = {
      getCatalogEntityDailyCost: jest.fn().mockResolvedValue(sampleAwsCost as any),
    };
    const mockFetchApi = {
      fetch: jest.fn().mockResolvedValue({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
      }),
    };

    render(
      <TestApiProvider
        apis={[
          [translationApiRef, mockApis.translation()],
          [errorApiRef, mockErrorApi],
          [costInsightsApiRef, mockClient as unknown as CostInsightsApi],
          [discoveryApiRef, mockDiscoveryApi],
          [fetchApiRef, mockFetchApi as unknown as FetchApi],
        ]}
      >
        <CleanEntityCostCard />
      </TestApiProvider>,
    );

    await waitFor(() => {
      const banner = screen.getByTestId('tco-banner');
      expect(banner).toHaveTextContent(/Monthly Cloud Cost \(AWS Cloud\)/i);
    });

    const banner = screen.getByTestId('tco-banner');
    expect(banner).toHaveTextContent('$305.00');
    expect(banner).toHaveTextContent(/Kubernetes cost data unavailable/i);
  });

  it('renders error state and does not show false TCO when AWS query fails', async () => {
    const mockClient = {
      getCatalogEntityDailyCost: jest.fn().mockRejectedValue(new Error('AWS Rate Limit')),
    };
    const mockFetchApi = {
      fetch: jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: [{ 'test-namespace': { totalCost: 1.0 } }],
        }),
      }),
    };

    render(
      <TestApiProvider
        apis={[
          [translationApiRef, mockApis.translation()],
          [errorApiRef, mockErrorApi],
          [costInsightsApiRef, mockClient as unknown as CostInsightsApi],
          [discoveryApiRef, mockDiscoveryApi],
          [fetchApiRef, mockFetchApi as unknown as FetchApi],
        ]}
      >
        <CleanEntityCostCard />
      </TestApiProvider>,
    );

    await waitFor(() => {
      const banner = screen.getByTestId('tco-banner');
      expect(banner).toHaveTextContent(/Consolidated Cost Unavailable/i);
    });

    const banner = screen.getByTestId('tco-banner');
    expect(banner).toHaveTextContent(/AWS cloud cost data unavailable/i);
    expect(screen.getByText(/Error fetching entity cost data: AWS Rate Limit/i)).toBeInTheDocument();
  });
});
