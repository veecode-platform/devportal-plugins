import {
  clusterAggregate,
  clusterMonthlyProjection,
  findClusterAllocation,
  findMatchingNamespaceAllocation,
  fetchOpenCostAllocations,
  parseLabelEquality,
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
      // Default window must be a COMPLETE day: 'today' is partial and would
      // make daily figures and *DAYS_IN_MONTH projections swing with the clock.
      expect(mockFetchApi.fetch).toHaveBeenCalledWith(
        expect.stringContaining('window=yesterday'),
      );
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

  describe('cluster cost card selector', () => {
    const SELECTOR = 'backstage.io/kubernetes-label-selector';

    function entityWith(
      name: string,
      annotations: Record<string, string> = {},
    ): Entity {
      return {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: { name, annotations },
      };
    }

    const allocations: Record<string, OpenCostAllocation> = {
      'sample-app-back': {
        name: 'sample-app-back',
        cpuCost: 0.01,
        ramCost: 0.02,
        totalCost: 0.0336,
        totalEfficiency: 0.5,
      },
      'shared-namespace': {
        name: 'shared-namespace',
        cpuCost: 1,
        ramCost: 1,
        totalCost: 2,
      },
      'loki-id': { name: 'loki-id', cpuCost: 0.5, ramCost: 0.5, totalCost: 1 },
      'demo-system': {
        name: 'demo-system',
        cpuCost: 0.1,
        ramCost: 0.1,
        totalCost: 0.2,
      },
    };

    describe('parseLabelEquality', () => {
      it('parses key=value into its key and value', () => {
        expect(
          parseLabelEquality('app.kubernetes.io/part-of=sample-app'),
        ).toEqual({ key: 'app.kubernetes.io/part-of', value: 'sample-app' });
      });

      it('accepts == and whitespace around the operator and the ends', () => {
        expect(parseLabelEquality('  app ==  sample-app-back ')).toEqual({
          key: 'app',
          value: 'sample-app-back',
        });
      });

      it('rejects a set-based selector', () => {
        expect(
          parseLabelEquality('app.kubernetes.io/instance in (loki, alloy)'),
        ).toBeNull();
      });

      it('rejects several terms', () => {
        expect(
          parseLabelEquality(
            'app=sample-app-back,app.kubernetes.io/part-of=sample-app',
          ),
        ).toBeNull();
      });

      it('rejects inequality, which a plain split on = would accept', () => {
        expect(parseLabelEquality('app!=sample-app-back')).toBeNull();
      });

      it('rejects an empty, missing or valueless selector', () => {
        expect(parseLabelEquality('')).toBeNull();
        expect(parseLabelEquality(undefined)).toBeNull();
        expect(parseLabelEquality('app=')).toBeNull();
      });
    });

    describe('clusterAggregate', () => {
      it('aggregates by the label key of a single equality selector', () => {
        const entity = entityWith('sample-app', {
          [SELECTOR]: 'app.kubernetes.io/part-of=sample-app',
        });
        expect(clusterAggregate(entity)).toBe(
          'label:app.kubernetes.io/part-of',
        );
      });

      it('aggregates by namespace for a set-based or absent selector', () => {
        const setBased = entityWith('loki', {
          [SELECTOR]: 'app.kubernetes.io/instance in (loki, alloy)',
        });
        expect(clusterAggregate(setBased)).toBe('namespace');
        expect(clusterAggregate(entityWith('plain'))).toBe('namespace');
      });
    });

    describe('findClusterAllocation', () => {
      it('returns the allocation under the selector value, ignoring the namespace annotation', () => {
        const entity = entityWith('sample-app-back', {
          [SELECTOR]: 'app=sample-app-back',
          'backstage.io/kubernetes-namespace': 'shared-namespace',
        });
        expect(findClusterAllocation(allocations, entity)?.name).toBe(
          'sample-app-back',
        );
      });

      it('returns null, without a namespace fallback, when the selector value has no allocation', () => {
        const entity = entityWith('shared-namespace', {
          [SELECTOR]: 'app=sample-app-front',
        });
        expect(findClusterAllocation(allocations, entity)).toBeNull();
      });

      it('does not read inherited object keys for a selector value', () => {
        const entity = entityWith('plain', { [SELECTOR]: 'app=constructor' });
        expect(findClusterAllocation(allocations, entity)).toBeNull();
      });

      it('matches the namespace annotation before the kubernetes-id and the entity name', () => {
        const entity = entityWith('demo-system', {
          'backstage.io/kubernetes-namespace': 'shared-namespace',
          'backstage.io/kubernetes-id': 'loki-id',
        });
        expect(findClusterAllocation(allocations, entity)?.name).toBe(
          'shared-namespace',
        );
      });

      it('matches the kubernetes-id before the entity name', () => {
        const entity = entityWith('demo-system', {
          'backstage.io/kubernetes-id': 'loki-id',
        });
        expect(findClusterAllocation(allocations, entity)?.name).toBe(
          'loki-id',
        );
      });

      it('matches the entity name when no annotation matches', () => {
        expect(
          findClusterAllocation(allocations, entityWith('demo-system'))?.name,
        ).toBe('demo-system');
      });

      it('uses namespace matching for a set-based selector', () => {
        const entity = entityWith('loki', {
          [SELECTOR]: 'app.kubernetes.io/instance in (loki, alloy)',
          'backstage.io/kubernetes-id': 'loki-id',
        });
        expect(findClusterAllocation(allocations, entity)?.name).toBe(
          'loki-id',
        );
      });

      it('returns null when nothing matches', () => {
        expect(
          findClusterAllocation(allocations, entityWith('aws-ec2-sandbox')),
        ).toBeNull();
      });
    });

    describe('clusterMonthlyProjection', () => {
      it('projects a 7-day total to 30 days', () => {
        expect(clusterMonthlyProjection(7)).toBe(30);
      });

      it('projects a small 7-day total proportionally', () => {
        expect(clusterMonthlyProjection(0.0336)).toBeCloseTo(0.144, 6);
      });
    });

    describe('fetch URL for the cluster card', () => {
      const mockDiscoveryApi = {
        getBaseUrl: jest
          .fn()
          .mockResolvedValue('http://localhost:7007/api/proxy'),
      };

      it('sends the window, the encoded label aggregate and accumulate', async () => {
        const mockFetchApi = {
          fetch: jest.fn().mockResolvedValue({
            ok: true,
            json: jest.fn().mockResolvedValue({ data: [] }),
          }),
        };

        await fetchOpenCostAllocations(
          mockDiscoveryApi as any,
          mockFetchApi as any,
          '7d',
          'label:app.kubernetes.io/part-of',
          true,
        );
        expect(mockFetchApi.fetch).toHaveBeenCalledWith(
          'http://localhost:7007/api/proxy/opencost/allocation/compute?window=7d&aggregate=label%3Aapp.kubernetes.io%2Fpart-of&accumulate=true',
        );
      });

      it('omits accumulate unless asked for', async () => {
        const mockFetchApi = {
          fetch: jest.fn().mockResolvedValue({
            ok: true,
            json: jest.fn().mockResolvedValue({ data: [] }),
          }),
        };

        await fetchOpenCostAllocations(
          mockDiscoveryApi as any,
          mockFetchApi as any,
        );
        expect(mockFetchApi.fetch).toHaveBeenCalledWith(
          'http://localhost:7007/api/proxy/opencost/allocation/compute?window=yesterday&aggregate=namespace',
        );
      });
    });
  });
});
