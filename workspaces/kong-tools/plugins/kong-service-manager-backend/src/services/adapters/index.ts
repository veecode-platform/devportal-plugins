import { KongPluginAdapter } from './types';
import { rateLimitingAdapter } from './rateLimiting';
import { correlationIdAdapter } from './correlationId';

export * from './types';

/**
 * The adapter registry IS the promotion allowlist (design 02, promotion
 * mechanics step 2 — the sensitive-field gate): a plugin type with no
 * adapter here cannot be promoted, full stop.
 */
export const adapterRegistry: Record<string, KongPluginAdapter> = {
  [rateLimitingAdapter.pluginType]: rateLimitingAdapter,
  [correlationIdAdapter.pluginType]: correlationIdAdapter,
};

export function getAdapter(pluginType: string): KongPluginAdapter | undefined {
  return adapterRegistry[pluginType];
}

export function isPromotable(pluginType: string): boolean {
  return pluginType in adapterRegistry;
}
