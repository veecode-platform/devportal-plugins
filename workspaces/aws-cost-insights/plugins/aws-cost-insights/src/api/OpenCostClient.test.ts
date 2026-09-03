import {
  findMatchingNamespaceAllocation,
  fetchOpenCostAllocations,
  DAYS_IN_MONTH,
  OpenCostAllocation,
} from './OpenCostClient';
import { Entity } from '@backstage/catalog-model';

describe('OpenCostClient', () => {
  describe('DAYS_IN_MONTH constant', () => {
    it('uses 30.5 as standard monthly multiplier', () => {
      expect(DAYS_IN_MONTH).toBe(30.5);
    });
  });

  describe('findMatchingNamespaceAllocation', () => {
    const allocations: Record<string, OpenCostAllocation> = {
      'demo-qa-system': {
        name: 'demo-qa-system',
        cpuCost: 0.1,
        ramCost: 0.2,
        totalCost: 0.3,
        totalEfficiency: 0.8,
      },
      'my-service-prod': {
        name: 'my-service-prod',
        cpuCost: 0.5,
        ramCost: 0.5,
        totalCost: 1.0,
        totalEfficiency: 0.6,
      },
    };

    it('matches exact backstage.io/kubernetes-namespace annotation', () => {
      const entity: Entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'other-name',
          annotations: {
            'backstage.io/kubernetes-namespace': 'my-service-prod',
          },
        },
      };

      const result = findMatchingNamespaceAllocation(allocations, entity);
      expect(result).not.toBeNull();
      expect(result?.namespace).toBe('my-service-prod');
      expect(result?.monthlyProjection).toBe(30.5); // 1.0 * 30.5
    });

    it('matches exact backstage.io/kubernetes-id annotation', () => {
      const entity: Entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'other-name',
          annotations: {
            'backstage.io/kubernetes-id': 'demo-qa-system',
          },
        },
      };

      const result = findMatchingNamespaceAllocation(allocations, entity);
      expect(result).not.toBeNull();
      expect(result?.namespace).toBe('demo-qa-system');
      expect(result?.monthlyProjection).toBe(9.15); // 0.3 * 30.5
    });

    it('matches exact entity.metadata.name', () => {
      const entity: Entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'demo-qa-system',
        },
      };

      const result = findMatchingNamespaceAllocation(allocations, entity);
      expect(result).not.toBeNull();
      expect(result?.namespace).toBe('demo-qa-system');
    });

    it('REJECTS substring collision matches (e.g. "qa" must not match "demo-qa-system")', () => {
      const entity: Entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'qa',
        },
      };

      const result = findMatchingNamespaceAllocation(allocations, entity);
      expect(result).toBeNull();
    });

    it('returns null when no matching workload is found', () => {
      const entity: Entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Resource',
        metadata: {
          name: 'aws-ec2-sandbox',
        },
      };

      const result = findMatchingNamespaceAllocation(allocations, entity);
      expect(result).toBeNull();
    });
  });

  describe('fetchOpenCostAllocations', () => {
    const mockDiscoveryApi = {
      getBaseUrl: jest.fn().mockResolvedValue('http://localhost:7007/api/proxy'),
    };

    it('throws error when response is not ok', async () => {
      const mockFetchApi = {
        fetch: jest.fn().mockResolvedValue({
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
        }),
      };

      await expect(
        fetchOpenCostAllocations(mockDiscoveryApi as any, mockFetchApi as any),
      ).rejects.toThrow('OpenCost proxy request failed with HTTP 503: Service Unavailable');
    });

    it('parses valid allocation data', async () => {
      const mockData = {
        data: [
          {
            default: {
              name: 'default',
              cpuCost: 0.05,
              ramCost: 0.1,
              totalCost: 0.15,
            },
          },
        ],
      };

      const mockFetchApi = {
        fetch: jest.fn().mockResolvedValue({
          ok: true,
          json: jest.fn().mockResolvedValue(mockData),
        }),
      };

      const result = await fetchOpenCostAllocations(
        mockDiscoveryApi as any,
        mockFetchApi as any,
      );
      expect(result).toHaveProperty('default');
      expect(result.default.totalCost).toBe(0.15);
    });

    it('returns empty object when data array is empty', async () => {
      const mockFetchApi = {
        fetch: jest.fn().mockResolvedValue({
          ok: true,
          json: jest.fn().mockResolvedValue({ data: [] }),
        }),
      };

      const result = await fetchOpenCostAllocations(
        mockDiscoveryApi as any,
        mockFetchApi as any,
      );
      expect(result).toEqual({});
    });
  });
});
