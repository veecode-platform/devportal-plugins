import { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';
import { Entity } from '@backstage/catalog-model';

export const DAYS_IN_MONTH = 30.5;

// The cluster cost card reads a 7-day total and projects it to a month as 30/7 of it.
export const CLUSTER_WINDOW = '7d';
const CLUSTER_WINDOW_DAYS = 7;
const CLUSTER_MONTH_DAYS = 30;

const SELECTOR_ANNOTATION = 'backstage.io/kubernetes-label-selector';
// Exactly one `key=value` or `key==value`. Inequality, set-based and multi-term
// selectors do not match, so they keep the namespace rules.
const SINGLE_EQUALITY =
  /^\s*([A-Za-z0-9][-A-Za-z0-9_./]*)\s*==?\s*([A-Za-z0-9][-A-Za-z0-9_.]*)\s*$/;

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
}

function toMatchedAllocation(
  namespace: string,
  allocation: OpenCostAllocation,
): MatchedNamespaceAllocation {
  return {
    namespace,
    allocation,
    monthlyProjection: Number(
      ((allocation.totalCost || 0) * DAYS_IN_MONTH).toFixed(2),
    ),
  };
}

export async function fetchOpenCostAllocations(
  discoveryApi: DiscoveryApi,
  fetchApi: FetchApi,
  // 'yesterday' is the most recent COMPLETE day. 'today' is a partial window
  // (midnight → now), so any daily figure or *DAYS_IN_MONTH projection built
  // on it would swing with the wall clock (~$0 right after midnight).
  window: string = 'yesterday',
  aggregate: string = 'namespace',
  accumulate: boolean = false,
): Promise<Record<string, OpenCostAllocation>> {
  const baseUrl = await discoveryApi.getBaseUrl('proxy');
  const response = await fetchApi.fetch(
    `${baseUrl}/opencost/allocation/compute?window=${encodeURIComponent(
      window,
    )}&aggregate=${encodeURIComponent(aggregate)}${
      accumulate ? '&accumulate=true' : ''
    }`,
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
    return toMatchedAllocation(explicitNs, allocations[explicitNs]);
  }

  const explicitK8sId =
    entity.metadata.annotations?.['backstage.io/kubernetes-id'];
  if (explicitK8sId && allocations[explicitK8sId]) {
    return toMatchedAllocation(explicitK8sId, allocations[explicitK8sId]);
  }

  // Exact match on entity name (no substring matching to avoid collisions)
  const entityName = entity.metadata.name;
  if (entityName && allocations[entityName]) {
    return toMatchedAllocation(entityName, allocations[entityName]);
  }

  return null;
}

export function parseLabelEquality(
  selector: string | undefined,
): { key: string; value: string } | null {
  const match = selector?.match(SINGLE_EQUALITY);
  return match ? { key: match[1], value: match[2] } : null;
}

export function clusterAggregate(entity: Entity): string {
  const equality = parseLabelEquality(
    entity.metadata.annotations?.[SELECTOR_ANNOTATION],
  );
  return equality ? `label:${equality.key}` : 'namespace';
}

export function findClusterAllocation(
  allocations: Record<string, OpenCostAllocation>,
  entity: Entity,
): OpenCostAllocation | null {
  const equality = parseLabelEquality(
    entity.metadata.annotations?.[SELECTOR_ANNOTATION],
  );
  if (equality) {
    // No namespace fallback: those rules would read a map keyed by label values.
    return Object.prototype.hasOwnProperty.call(allocations, equality.value)
      ? allocations[equality.value]
      : null;
  }
  return (
    findMatchingNamespaceAllocation(allocations, entity)?.allocation ?? null
  );
}

export function clusterMonthlyProjection(windowTotal: number): number {
  return (windowTotal * CLUSTER_MONTH_DAYS) / CLUSTER_WINDOW_DAYS;
}
