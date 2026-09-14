import { rateLimitingAdapter } from './rateLimiting';

describe('rateLimitingAdapter', () => {
  it('is registered under the rate-limiting plugin type and is not sensitive', () => {
    expect(rateLimitingAdapter.pluginType).toBe('rate-limiting');
    expect(rateLimitingAdapter.sensitive).toBe(false);
  });

  it('produces a values.yaml merge and a KongPlugin template create for the golden-path chart idiom', () => {
    const edits = rateLimitingAdapter.toChartEdits({ minute: 60 });

    expect(edits).toEqual([
      {
        path: 'chart/values.yaml',
        op: 'merge',
        values: { kongPlugins: { rateLimiting: { minute: 60 } } },
      },
      {
        path: 'chart/templates/kongplugin-rate-limiting.yaml',
        op: 'create',
        content: expect.stringContaining('.Values.kongPlugins.rateLimiting.minute'),
      },
    ]);
  });

  it('rejects a live config with no numeric minute field', () => {
    expect(() => rateLimitingAdapter.toChartEdits({})).toThrow(/minute/);
    expect(() => rateLimitingAdapter.toChartEdits({ minute: '60' })).toThrow(/minute/);
  });

  it('extracts only the promoted field from a rendered KongPlugin manifest', () => {
    const rendered = rateLimitingAdapter.fromRendered({
      kind: 'KongPlugin',
      plugin: 'rate-limiting',
      config: { minute: 60, policy: 'local' },
    });

    expect(rendered).toEqual({ minute: 60 });
  });
});
