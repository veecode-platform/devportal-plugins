import { adapterRegistry, getAdapter, isPromotable } from './index';
import { rateLimitingAdapter } from './rateLimiting';
import { correlationIdAdapter } from './correlationId';

describe('adapter registry', () => {
  it('is exactly the promotion allowlist: rate-limiting and correlation-id', () => {
    expect(Object.keys(adapterRegistry).sort()).toEqual(['correlation-id', 'rate-limiting']);
  });

  it('resolves a registered plugin type to its adapter', () => {
    expect(getAdapter('rate-limiting')).toBe(rateLimitingAdapter);
    expect(getAdapter('correlation-id')).toBe(correlationIdAdapter);
  });

  it('has no adapter for a plugin type outside the v1 allowlist', () => {
    expect(getAdapter('jwt')).toBeUndefined();
    expect(isPromotable('jwt')).toBe(false);
  });

  it('every registered adapter is non-sensitive (v1 sensitive-field gate)', () => {
    for (const adapter of Object.values(adapterRegistry)) {
      expect(adapter.sensitive).toBe(false);
    }
  });
});
