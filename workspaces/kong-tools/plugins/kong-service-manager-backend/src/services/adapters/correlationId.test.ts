import { correlationIdAdapter } from './correlationId';

describe('correlationIdAdapter', () => {
  it('is registered under the correlation-id plugin type and is not sensitive', () => {
    expect(correlationIdAdapter.pluginType).toBe('correlation-id');
    expect(correlationIdAdapter.sensitive).toBe(false);
  });

  it('promotes header name, generator and echo_downstream into the golden-path chart idiom (#127)', () => {
    const edits = correlationIdAdapter.toChartEdits({
      header_name: 'X-Correlation-Id',
      generator: 'uuid',
      echo_downstream: true,
    });

    expect(edits).toEqual([
      {
        path: 'chart/values.yaml',
        op: 'merge',
        values: {
          kongPlugins: { correlationId: { headerName: 'X-Correlation-Id', generator: 'uuid', echoDownstream: true } },
        },
      },
      {
        path: 'chart/templates/kongplugin-correlation-id.yaml',
        op: 'create',
        content: expect.stringMatching(/headerName[\s\S]*generator[\s\S]*echoDownstream/),
      },
    ]);
  });

  it("falls back to Kong's defaults when the live config omits generator / echo_downstream", () => {
    const [merge] = correlationIdAdapter.toChartEdits({ header_name: 'X-Correlation-Id' });
    expect(merge).toMatchObject({
      values: { kongPlugins: { correlationId: { generator: 'uuid#counter', echoDownstream: false } } },
    });
  });

  it('rejects a live config with no non-empty header_name field', () => {
    expect(() => correlationIdAdapter.toChartEdits({})).toThrow(/header_name/);
    expect(() => correlationIdAdapter.toChartEdits({ header_name: '' })).toThrow(/header_name/);
  });

  it('normalizes the three promoted fields from a rendered KongPlugin manifest, ignoring the rest', () => {
    const rendered = correlationIdAdapter.fromRendered({
      kind: 'KongPlugin',
      plugin: 'correlation-id',
      config: { header_name: 'X-Correlation-Id', echo_downstream: true, generator: 'uuid', tags: ['x'] },
    });

    expect(rendered).toEqual({ header_name: 'X-Correlation-Id', generator: 'uuid', echo_downstream: true });
  });

  it('a golden-path chart (echo_downstream true, generator uuid) and a live plugin with the same values are equal', () => {
    const live = correlationIdAdapter.fromRendered({ config: { header_name: 'X-Request-Id', echo_downstream: true, generator: 'uuid' } });
    const rendered = correlationIdAdapter.fromRendered({ config: { header_name: 'X-Request-Id', echo_downstream: true, generator: 'uuid' } });
    expect(rendered).toEqual(live);
  });

  it('removes the plugin by deleting its generated template, and expectedTemplate matches the create edit (issue #3)', () => {
    expect(correlationIdAdapter.toChartRemoval()).toEqual([
      { path: 'chart/values.yaml', op: 'delete-key', keyPath: ['kongPlugins', 'correlationId'] },
      { path: 'chart/templates/kongplugin-correlation-id.yaml', op: 'delete' },
    ]);
    const created = correlationIdAdapter
      .toChartEdits({ header_name: 'X-Correlation-Id' })
      .find(e => e.op === 'create') as { content: string };
    expect(correlationIdAdapter.expectedTemplate()).toEqual({
      path: 'chart/templates/kongplugin-correlation-id.yaml',
      content: created.content,
    });
  });
});
