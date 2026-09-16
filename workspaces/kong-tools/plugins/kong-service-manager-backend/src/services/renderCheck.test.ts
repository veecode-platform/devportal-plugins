import * as fs from 'fs/promises';
import * as path from 'path';
import { renderCheck } from './renderCheck';
import { rateLimitingAdapter } from './adapters/rateLimiting';
import { correlationIdAdapter } from './adapters/correlationId';
import { copyGoldenPathRepo } from './__fixtures__/copyGoldenPathRepo';

describe('renderCheck', () => {
  let repoDir: string;

  beforeEach(async () => {
    repoDir = await copyGoldenPathRepo();
  });

  afterEach(async () => {
    await fs.rm(repoDir, { recursive: true, force: true });
  });

  it('rate-limiting: creates the KongPlugin manifest and confirms it equals the live config', async () => {
    const templatePath = path.join(repoDir, 'chart/templates/kongplugin-rate-limiting.yaml');
    await expect(fs.access(templatePath)).rejects.toThrow();

    const liveConfig = { minute: 60 };
    const result = await renderCheck({
      repoDir,
      adapter: rateLimitingAdapter,
      edits: rateLimitingAdapter.toChartEdits(liveConfig),
      liveConfig,
    });

    expect(result).toEqual({ equal: true });
    await expect(fs.access(templatePath)).resolves.toBeUndefined();
  });

  it('rate-limiting: update case — a second promotion reflects the new value, not the old one', async () => {
    await renderCheck({
      repoDir,
      adapter: rateLimitingAdapter,
      edits: rateLimitingAdapter.toChartEdits({ minute: 60 }),
      liveConfig: { minute: 60 },
    });

    const updatedLiveConfig = { minute: 120 };
    const result = await renderCheck({
      repoDir,
      adapter: rateLimitingAdapter,
      edits: rateLimitingAdapter.toChartEdits(updatedLiveConfig),
      liveConfig: updatedLiveConfig,
    });

    expect(result).toEqual({ equal: true });

    // the OLD config must not still pass — this is exactly the update-case
    // guard the finalizer relies on (design 02 acceptance item 2).
    const staleCheck = await renderCheck({
      repoDir,
      adapter: rateLimitingAdapter,
      edits: [],
      liveConfig: { minute: 60 },
    });
    expect(staleCheck.equal).toBe(false);
  });

  it('correlation-id: creates the KongPlugin manifest and confirms it equals the live config', async () => {
    const liveConfig = { header_name: 'X-Correlation-Id', generator: 'uuid', echo_downstream: true };
    const result = await renderCheck({
      repoDir,
      adapter: correlationIdAdapter,
      edits: correlationIdAdapter.toChartEdits(liveConfig),
      liveConfig,
    });

    expect(result).toEqual({ equal: true });
  });

  it('correlation-id: update case — a second promotion reflects the new header, not the old one', async () => {
    await renderCheck({
      repoDir,
      adapter: correlationIdAdapter,
      edits: correlationIdAdapter.toChartEdits({ header_name: 'X-Correlation-Id', generator: 'uuid', echo_downstream: true }),
      liveConfig: { header_name: 'X-Correlation-Id', generator: 'uuid', echo_downstream: true },
    });

    const updatedLiveConfig = { header_name: 'X-Request-Trace', generator: 'uuid#counter', echo_downstream: false };
    const result = await renderCheck({
      repoDir,
      adapter: correlationIdAdapter,
      edits: correlationIdAdapter.toChartEdits(updatedLiveConfig),
      liveConfig: updatedLiveConfig,
    });

    expect(result).toEqual({ equal: true });
  });

  it('aborts with a diff when the rendered config drifts from the live config', async () => {
    const generatedFrom = { minute: 60 };
    const result = await renderCheck({
      repoDir,
      adapter: rateLimitingAdapter,
      edits: rateLimitingAdapter.toChartEdits(generatedFrom),
      // simulates the live config having changed after generation but before the check
      liveConfig: { minute: 999 },
    });

    expect(result.equal).toBe(false);
    expect(result.diff).toContain('60');
    expect(result.diff).toContain('999');
  });

  it('aborts with a diff when the chart renders no KongPlugin for the plugin type at all', async () => {
    const result = await renderCheck({
      repoDir,
      adapter: rateLimitingAdapter,
      edits: [],
      liveConfig: { minute: 60 },
    });

    expect(result.equal).toBe(false);
    expect(result.diff).toContain('rate-limiting');
  });
});
