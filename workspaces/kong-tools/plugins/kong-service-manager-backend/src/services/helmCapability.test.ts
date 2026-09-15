import { probeHelm, createHelmCapabilityGate } from './helmCapability';

describe('probeHelm', () => {
  it('reports available with the version when helm answers', async () => {
    const result = await probeHelm('helm', 5);
    expect(result.available).toBe(true);
    expect(result.path).toBe('helm');
    expect(result.version).toBeTruthy();
    expect(result.error).toBeUndefined();
  });

  it('reports unavailable with an actionable message naming the configured path when helm is not found', async () => {
    const result = await probeHelm('/definitely/not/on/disk/helm', 5);
    expect(result.available).toBe(false);
    expect(result.path).toBe('/definitely/not/on/disk/helm');
    expect(result.error).toContain('/definitely/not/on/disk/helm');
    expect(result.error).toContain('kong.promotion.helmPath');
    expect(result.error).toContain('Prerequisites');
  });
});

describe('createHelmCapabilityGate', () => {
  it('returns the cached capability without re-probing once available', async () => {
    const gate = createHelmCapabilityGate({
      helmPath: 'helm',
      timeoutSeconds: 5,
      initial: { available: true, path: 'helm', version: 'v3.0.0' },
    });

    const first = await gate.getCapability();
    const second = await gate.getCapability();
    expect(first).toBe(second);
  });

  it('re-probes on every call while unavailable, so a fixed deployment recovers without a restart', async () => {
    const gate = createHelmCapabilityGate({
      helmPath: 'helm',
      timeoutSeconds: 5,
      initial: { available: false, path: 'helm', error: 'stale probe' },
    });

    const recovered = await gate.getCapability();
    expect(recovered.available).toBe(true);
    expect(recovered.error).toBeUndefined();
  });
});
