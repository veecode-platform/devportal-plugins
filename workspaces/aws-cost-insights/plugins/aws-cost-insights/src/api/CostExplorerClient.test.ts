import { CostExplorerClient } from './CostExplorerClient';

describe('CostExplorerClient', () => {
  const mockDiscoveryApi = {
    getBaseUrl: jest.fn().mockResolvedValue('http://localhost:7007/api/cost-insights-aws'),
  };
  const mockFetchApi = {
    fetch: jest.fn(),
  };
  const mockCatalogApi = {
    getEntities: jest.fn(),
  };

  let client: CostExplorerClient;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new CostExplorerClient(
      mockDiscoveryApi as any,
      mockFetchApi as any,
      mockCatalogApi as any,
    );
  });

  describe('getUserGroups', () => {
    it('does NOT double-prefix userEntityRef if already fully qualified', async () => {
      mockCatalogApi.getEntities.mockResolvedValue({
        items: [
          {
            apiVersion: 'backstage.io/v1alpha1',
            kind: 'Group',
            metadata: { name: 'cloud-team', namespace: 'default', title: 'Cloud Team' },
          },
        ],
      });

      const groups = await client.getUserGroups('user:default/john.doe');
      expect(mockCatalogApi.getEntities).toHaveBeenCalledWith({
        filter: {
          kind: 'Group',
          'relations.hasMember': ['user:default/john.doe'],
        },
      });
      expect(groups).toHaveLength(1);
      expect(groups[0].name).toBe('Cloud Team');
    });

    it('prefixes user:default/ when bare username is provided', async () => {
      mockCatalogApi.getEntities.mockResolvedValue({ items: [] });

      await client.getUserGroups('john.doe');
      expect(mockCatalogApi.getEntities).toHaveBeenCalledWith({
        filter: {
          kind: 'Group',
          'relations.hasMember': ['user:default/john.doe'],
        },
      });
    });

    it('returns empty array when user is in no groups, never falling back to all catalog groups', async () => {
      mockCatalogApi.getEntities.mockResolvedValue({ items: [] });

      const groups = await client.getUserGroups('user:default/guest');
      expect(groups).toEqual([]);
      // Ensure getEntities was called only once (no fallback call)
      expect(mockCatalogApi.getEntities).toHaveBeenCalledTimes(1);
    });
  });

  describe('getLastCompleteBillingDate', () => {
    it('returns yesterday formatted as yyyy-mm-dd', async () => {
      const yesterday = new Date(Date.now() - 86400000);
      const expectedYear = yesterday.getFullYear();
      const dateStr = await client.getLastCompleteBillingDate();
      expect(dateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(dateStr.startsWith(String(expectedYear))).toBe(true);
    });
  });
});
