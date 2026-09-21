import {
  {{camelName}}Plugin,
  {{pascalName}}Page,
} from './plugin';

describe('{{name}}', () => {
  it('exports the plugin', () => {
    expect({{camelName}}Plugin).toBeDefined();
  });

  it('exports a routable page extension for dynamic routes', () => {
    const extensionData = (
      {{pascalName}}Page as unknown as {
        __backstage_data?: { map?: Map<string, unknown> };
      }
    ).__backstage_data;

    expect(extensionData?.map?.has('core.mountPoint')).toBe(true);
  });
});
