import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { TestApiProvider, mockApis } from '@backstage/test-utils';
import { identityApiRef, IdentityApi } from '@backstage/core-plugin-api';
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
    };
    const mockCatalogApi = {
      getEntitiesByRefs: jest.fn().mockResolvedValue({
        items: [
          {
            metadata: {
              annotations: {
                'aws.amazon.com/cost-insights-tags': 'Name=eks-platform-vtg',
              },
            },
          },
        ],
      }),
    };

    render(
      <TestApiProvider
        apis={[
          [translationApiRef, mockApis.translation()],
          [identityApiRef, mockIdentityApi],
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

    render(
      <TestApiProvider
        apis={[
          [translationApiRef, mockApis.translation()],
          [identityApiRef, mockIdentityApi],
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
});
