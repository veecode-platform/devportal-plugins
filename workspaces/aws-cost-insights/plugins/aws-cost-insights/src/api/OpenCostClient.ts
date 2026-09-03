import { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';
import { Entity } from '@backstage/catalog-model';

export const DAYS_IN_MONTH = 30.5;

export interface OpenCostAllocation {
  name: string;
  cpuCost: number;
  ramCost: number;
  gpuCost?: number;
  pvCost?: number;
  networkCost?: number;
  sharedCost?: number;
  externalCost?: number;
  totalCost: number;
  cpuEfficiency?: number;
  ramEfficiency?: number;
  totalEfficiency?: number;
}

export interface MatchedNamespaceAllocation {
  namespace: string;
  allocation: OpenCostAllocation;
  monthlyProjection: number;
  isExactNamespace: boolean;
}

export async function fetchOpenCostAllocations(
  discoveryApi: DiscoveryApi,
  fetchApi: FetchApi,
  window: string = 'today',
  aggregate: string = 'namespace',
): Promise<Record<string, OpenCostAllocation>> {
  const baseUrl = await discoveryApi.getBaseUrl('proxy');
  const response = await fetchApi.fetch(
    `${baseUrl}/opencost/allocation/compute?window=${encodeURIComponent(
      window,
    )}&aggregate=${encodeURIComponent(aggregate)}`,
  );

  if (!response.ok) {
    throw new Error(
      `OpenCost proxy request failed with HTTP ${response.status}: ${response.statusText}`,
    );
  }

  const json = await response.json();
  if (!json?.data || !Array.isArray(json.data) || json.data.length === 0) {
    return {};
  }

  return json.data[0] as Record<string, OpenCostAllocation>;
}

export function findMatchingNamespaceAllocation(
  allocations: Record<string, OpenCostAllocation>,
  entity: Entity,
): MatchedNamespaceAllocation | null {
  const explicitNs =
    entity.metadata.annotations?.['backstage.io/kubernetes-namespace'];
  if (explicitNs && allocations[explicitNs]) {
    const alloc = allocations[explicitNs];
    return {
      namespace: explicitNs,
      allocation: alloc,
      monthlyProjection: Number(((alloc.totalCost || 0) * DAYS_IN_MONTH).toFixed(2)),
      isExactNamespace: true,
    };
  }

  const explicitK8sId =
    entity.metadata.annotations?.['backstage.io/kubernetes-id'];
  if (explicitK8sId && allocations[explicitK8sId]) {
    const alloc = allocations[explicitK8sId];
    return {
      namespace: explicitK8sId,
      allocation: alloc,
      monthlyProjection: Number(((alloc.totalCost || 0) * DAYS_IN_MONTH).toFixed(2)),
      isExactNamespace: true,
    };
  }

  // Exact match on entity name (no substring matching to avoid collisions)
  const entityName = entity.metadata.name;
  if (entityName && allocations[entityName]) {
    const alloc = allocations[entityName];
    return {
      namespace: entityName,
      allocation: alloc,
      monthlyProjection: Number(((alloc.totalCost || 0) * DAYS_IN_MONTH).toFixed(2)),
      isExactNamespace: true,
    };
  }

  return null;
}
