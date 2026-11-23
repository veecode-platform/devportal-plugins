import { render, screen } from '@testing-library/react';
import { TestApiProvider, mockApis } from '@backstage/test-utils';
import {
  discoveryApiRef,
  errorApiRef,
  fetchApiRef,
  DiscoveryApi,
  ErrorApi,
  FetchApi,
} from '@backstage/core-plugin-api';
import { translationApiRef } from '@backstage/core-plugin-api/alpha';
import { Entity } from '@backstage/catalog-model';
import { EntityClusterCostCard } from './EntityClusterCostCard';

const SELECTOR = 'backstage.io/kubernetes-label-selector';
const COMPUTE_URL =
  'http://localhost:7007/api/proxy/opencost/allocation/compute';

let mockCurrentEntity: Entity;

jest.mock('@backstage/plugin-catalog-react', () => ({
  useEntity: () => ({ entity: mockCurrentEntity }),
}));

const mockDiscoveryApi = {
  getBaseUrl: jest.fn().mockResolvedValue('http://localhost:7007/api/proxy'),
} as unknown as DiscoveryApi;

const mockErrorApi = {
  post: jest.fn(),
  error$: jest.fn(),
} as unknown as ErrorApi;

function entityWith(annotations: Record<string, string>): Entity {
  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: { name: 'sample-app', annotations },
  };
}

function renderCardWithAllocations(allocations: Record<string, unknown>) {
  const mockFetchApi = {
    fetch: jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ data: [allocations] }),
    }),
  };

  render(
    <TestApiProvider
      apis={[
        [translationApiRef, mockApis.translation()],
        [errorApiRef, mockErrorApi],
        [discoveryApiRef, mockDiscoveryApi],
        [fetchApiRef, mockFetchApi as unknown as FetchApi],
      ]}
    >
      <EntityClusterCostCard />
    </TestApiProvider>,
  );

  return mockFetchApi;
}

describe('EntityClusterCostCard', () => {
  it('asks for the selector label over 7 days and shows the row with a 30/7 projection', async () => {
    mockCurrentEntity = entityWith({
      [SELECTOR]: 'app.kubernetes.io/part-of=sample-app',
    });
    const fetchApi = renderCardWithAllocations({
      'sample-app': {
        name: 'sample-app',
        cpuCost: 3,
        ramCost: 4,
        totalCost: 7,
      },
    });

    expect(await screen.findByText('$30.00')).toBeInTheDocument();
    expect(screen.getByText('$7.00')).toBeInTheDocument();
    expect(screen.getByText('CPU Cost (7 days)')).toBeInTheDocument();
    expect(fetchApi.fetch).toHaveBeenCalledWith(
      `${COMPUTE_URL}?window=7d&aggregate=label%3Aapp.kubernetes.io%2Fpart-of&accumulate=true`,
    );
  });

  it('keeps the namespace request for an entity without a single equality selector', async () => {
    mockCurrentEntity = entityWith({
      'backstage.io/kubernetes-namespace': 'shared-namespace',
    });
    const fetchApi = renderCardWithAllocations({
      'shared-namespace': {
        name: 'shared-namespace',
        cpuCost: 1,
        ramCost: 1,
        totalCost: 2,
      },
    });

    expect(await screen.findByText('$8.57')).toBeInTheDocument();
    expect(fetchApi.fetch).toHaveBeenCalledWith(
      `${COMPUTE_URL}?window=7d&aggregate=namespace&accumulate=true`,
    );
  });

  it('shows the no-workload message when the selector value is missing, even if the namespace has data', async () => {
    mockCurrentEntity = entityWith({
      [SELECTOR]: 'app=sample-app-front',
      'backstage.io/kubernetes-namespace': 'shared-namespace',
    });
    renderCardWithAllocations({
      'shared-namespace': {
        name: 'shared-namespace',
        cpuCost: 1,
        ramCost: 1,
        totalCost: 2,
      },
    });

    expect(
      await screen.findByText(
        'No workload found in the cluster for this identifier in the last 7 days.',
      ),
    ).toBeInTheDocument();
  });
});
