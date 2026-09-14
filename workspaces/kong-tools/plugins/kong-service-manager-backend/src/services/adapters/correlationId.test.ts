import { correlationIdAdapter } from './correlationId';

describe('correlationIdAdapter', () => {
  it('is registered under the correlation-id plugin type and is not sensitive', () => {
    expect(correlationIdAdapter.pluginType).toBe('correlation-id');
    expect(correlationIdAdapter.sensitive).toBe(false);
  });

  it('produces a values.yaml merge and a KongPlugin template create for the golden-path chart idiom', () => {
    const edits = correlationIdAdapter.toChartEdits({ header_name: 'X-Correlation-Id' });

    expect(edits).toEqual([
      {
        path: 'chart/values.yaml',
        op: 'merge',
        values: { kongPlugins: { correlationId: { headerName: 'X-Correlation-Id' } } },
      },
      {
        path: 'chart/templates/kongplugin-correlation-id.yaml',
        op: 'create',
        content: expect.stringContaining('.Values.kongPlugins.correlationId.headerName'),
      },
    ]);
  });

  it('rejects a live config with no non-empty header_name field', () => {
    expect(() => correlationIdAdapter.toChartEdits({})).toThrow(/header_name/);
    expect(() => correlationIdAdapter.toChartEdits({ header_name: '' })).toThrow(/header_name/);
  });

  it('extracts only the promoted field from a rendered KongPlugin manifest', () => {
    const rendered = correlationIdAdapter.fromRendered({
      kind: 'KongPlugin',
      plugin: 'correlation-id',
      config: { header_name: 'X-Correlation-Id', echo_downstream: false },
    });

    expect(rendered).toEqual({ header_name: 'X-Correlation-Id' });
  });
});
