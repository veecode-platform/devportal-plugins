import { fireEvent, screen, waitFor } from '@testing-library/react';
import {
  renderInTestApp,
  TestApiProvider,
  mockApis,
} from '@backstage/test-utils';
import {
  identityApiRef,
  IdentityApi,
  errorApiRef,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/core-plugin-api';
import { translationApiRef } from '@backstage/core-plugin-api/alpha';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import {
  costInsightsApiRef,
  CostInsightsApi,
} from '@backstage-community/plugin-cost-insights';
import { CleanCostInsightsPage } from './CleanCostInsightsPage';

// Polyfill ResizeObserver for recharts ResponsiveContainer in JSDOM
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as any;

describe('CleanCostInsightsPage group filtering', () => {
  const mockIdentityApi = {
    getBackstageIdentity: jest.fn().mockResolvedValue({
      type: 'user',
      userEntityRef: 'user:default/giovanicorrea',
      ownershipEntityRefs: [],
    }),
  } as unknown as IdentityApi;

  const mockErrorApi = { post: jest.fn(), error$: jest.fn() };
  // GlobalClusterCostCard (rendered below the chart) fetches OpenCost via
  // discovery+fetch; a rejected fetch keeps it in its own error state
  // without touching the group-filter logic under test.
  const mockDiscoveryApi = {
    getBaseUrl: jest.fn().mockResolvedValue('http://localhost/api/proxy'),
  };
  const mockFetchApi = {
    fetch: jest.fn().mockRejectedValue(new Error('no opencost in tests')),
  };

  const baseApis = [
    [translationApiRef, mockApis.translation()],
    [identityApiRef, mockIdentityApi],
    [errorApiRef, mockErrorApi],
    [discoveryApiRef, mockDiscoveryApi],
    [fetchApiRef, mockFetchApi],
  ] as const;

  it('queries annotations with Group.id verbatim (already a full entity ref) and keeps annotated groups', async () => {
    // Regression: Group.id comes from stringifyEntityRef ('group:default/finops');
    // prefixing it again ('group:default/group:default/finops') matches nothing
    // and silently filtered every group out (prod, 2026-09-03).
    const mockClient = {
      getUserGroups: jest
        .fn()
        .mockResolvedValue([{ id: 'group:default/finops', name: 'FinOps' }]),
      getLastCompleteBillingDate: jest.fn().mockResolvedValue('2026-09-02'),
      getGroupDailyCost: jest.fn(() => new Promise(() => {})),
      getGroupProjects: jest.fn().mockResolvedValue([]),
    };
    const mockCatalogApi = {
      getEntitiesByRefs: jest.fn().mockResolvedValue({
        items: [
          {
            metadata: {
              annotations: {
                'aws.amazon.com/cost-insights-tags': 'Name=example-cluster',
              },
            },
          },
        ],
      }),
    };

    await renderInTestApp(
      <TestApiProvider
        apis={[
          ...baseApis,
          [catalogApiRef, mockCatalogApi as any],
          [costInsightsApiRef, mockClient as unknown as CostInsightsApi],
        ]}
      >
        <CleanCostInsightsPage />
      </TestApiProvider>,
    );

    await waitFor(() => {
      expect(mockCatalogApi.getEntitiesByRefs).toHaveBeenCalledWith({
        entityRefs: ['group:default/finops'],
        fields: ['metadata.annotations'],
      });
    });
    // The annotated group survives the filter: no empty-state message.
    await waitFor(() => {
      expect(mockClient.getGroupDailyCost).toHaveBeenCalled();
    });
    expect(
      screen.queryByText(/not assigned to any catalog group/i),
    ).toBeNull();
  });

  it('shows the no-groups message when no group carries the annotation', async () => {
    const mockClient = {
      getUserGroups: jest
        .fn()
        .mockResolvedValue([{ id: 'group:default/platform-admins', name: 'Admins' }]),
      getLastCompleteBillingDate: jest.fn().mockResolvedValue('2026-09-02'),
      getGroupDailyCost: jest.fn(),
    };
    const mockCatalogApi = {
      getEntitiesByRefs: jest.fn().mockResolvedValue({
        items: [{ metadata: { annotations: {} } }],
      }),
    };

    await renderInTestApp(
      <TestApiProvider
        apis={[
          ...baseApis,
          [catalogApiRef, mockCatalogApi as any],
          [costInsightsApiRef, mockClient as unknown as CostInsightsApi],
        ]}
      >
        <CleanCostInsightsPage />
      </TestApiProvider>,
    );

    await waitFor(() => {
      expect(
        screen.getByText(/not assigned to any catalog group/i),
      ).toBeInTheDocument();
    });
    expect(mockClient.getGroupDailyCost).not.toHaveBeenCalled();
  });

  it('shows the account selector when projects resolve and switches to project cost', async () => {
    const mockClient = {
      getUserGroups: jest
        .fn()
        .mockResolvedValue([{ id: 'group:default/finops', name: 'FinOps' }]),
      getLastCompleteBillingDate: jest.fn().mockResolvedValue('2026-09-02'),
      getGroupDailyCost: jest.fn(() => new Promise(() => {})),
      getGroupProjects: jest
        .fn()
        .mockResolvedValue([{ id: '111111111111', name: 'dev' }]),
      getProjectDailyCost: jest.fn(() => new Promise(() => {})),
    };
    const mockCatalogApi = {
      getEntitiesByRefs: jest.fn().mockResolvedValue({
        items: [
          {
            metadata: {
              annotations: {
                'aws.amazon.com/cost-insights-tags': 'Name=example-cluster',
              },
            },
          },
        ],
      }),
    };

    await renderInTestApp(
      <TestApiProvider
        apis={[
          ...baseApis,
          [catalogApiRef, mockCatalogApi as any],
          [costInsightsApiRef, mockClient as unknown as CostInsightsApi],
        ]}
      >
        <CleanCostInsightsPage />
      </TestApiProvider>,
    );

    const combo = await screen.findByLabelText(/AWS Account/i);
    fireEvent.mouseDown(combo);
    fireEvent.click(await screen.findByText('dev (111111111111)'));

    await waitFor(() => {
      expect(mockClient.getProjectDailyCost).toHaveBeenCalledWith(
        '111111111111',
        expect.stringMatching(/^R90\/P1D\//),
      );
    });
  });

  it('queries org-wide cost when the organization option is selected', async () => {
    const mockClient = {
      getUserGroups: jest
        .fn()
        .mockResolvedValue([{ id: 'group:default/finops', name: 'FinOps' }]),
      getLastCompleteBillingDate: jest.fn().mockResolvedValue('2026-09-02'),
      getGroupDailyCost: jest.fn(() => new Promise(() => {})),
      getGroupProjects: jest
        .fn()
        .mockResolvedValue([{ id: '111111111111', name: 'dev' }]),
      getProjectDailyCost: jest.fn(() => new Promise(() => {})),
      getOrgDailyCost: jest.fn(() => new Promise(() => {})),
    };
    const mockCatalogApi = {
      getEntitiesByRefs: jest.fn().mockResolvedValue({
        items: [
          {
            metadata: {
              annotations: {
                'aws.amazon.com/cost-insights-tags': 'Name=example-cluster',
              },
            },
          },
        ],
      }),
    };

    await renderInTestApp(
      <TestApiProvider
        apis={[
          ...baseApis,
          [catalogApiRef, mockCatalogApi as any],
          [costInsightsApiRef, mockClient as unknown as CostInsightsApi],
        ]}
      >
        <CleanCostInsightsPage />
      </TestApiProvider>,
    );

    const combo = await screen.findByLabelText(/AWS Account/i);
    fireEvent.mouseDown(combo);
    fireEvent.click(await screen.findByText('Organization (all accounts)'));

    await waitFor(() => {
      expect(mockClient.getOrgDailyCost).toHaveBeenCalledWith(
        expect.stringMatching(/^R90\/P1D\//),
      );
    });
    expect(mockClient.getProjectDailyCost).not.toHaveBeenCalled();
  });

  it('keeps the default group-tag view calling getGroupDailyCost when the org option is merely present', async () => {
    const mockClient = {
      getUserGroups: jest
        .fn()
        .mockResolvedValue([{ id: 'group:default/finops', name: 'FinOps' }]),
      getLastCompleteBillingDate: jest.fn().mockResolvedValue('2026-09-02'),
      getGroupDailyCost: jest.fn(() => new Promise(() => {})),
      getGroupProjects: jest
        .fn()
        .mockResolvedValue([{ id: '111111111111', name: 'dev' }]),
      getProjectDailyCost: jest.fn(() => new Promise(() => {})),
      getOrgDailyCost: jest.fn(() => new Promise(() => {})),
    };
    const mockCatalogApi = {
      getEntitiesByRefs: jest.fn().mockResolvedValue({
        items: [
          {
            metadata: {
              annotations: {
                'aws.amazon.com/cost-insights-tags': 'Name=example-cluster',
              },
            },
          },
        ],
      }),
    };

    await renderInTestApp(
      <TestApiProvider
        apis={[
          ...baseApis,
          [catalogApiRef, mockCatalogApi as any],
          [costInsightsApiRef, mockClient as unknown as CostInsightsApi],
        ]}
      >
        <CleanCostInsightsPage />
      </TestApiProvider>,
    );

    // The closed select shows the relabeled default option's text — guards
    // against a regression back to the old misleading 'All accounts' label —
    // and no selection change means the default group-tag branch
    // (getGroupDailyCost) is what fires: the new 'org' MenuItem being present
    // must not short-circuit it.
    await screen.findByLabelText(/AWS Account/i);
    expect(await screen.findByText('Group view (tags)')).toBeInTheDocument();
    expect(screen.queryByText('All accounts')).toBeNull();

    await waitFor(() => {
      expect(mockClient.getGroupDailyCost).toHaveBeenCalledWith(
        'group:default/finops',
        expect.stringMatching(/^R90\/P1D\//),
      );
    });
    expect(mockClient.getOrgDailyCost).not.toHaveBeenCalled();
    expect(mockClient.getProjectDailyCost).not.toHaveBeenCalled();
  });
});
