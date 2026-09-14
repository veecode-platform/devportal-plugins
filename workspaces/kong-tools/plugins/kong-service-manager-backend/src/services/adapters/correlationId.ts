import { FileEdit, KongPluginAdapter, NormalizedConfig } from './types';

const PLUGIN_TYPE = 'correlation-id';
const TEMPLATE_PATH = `chart/templates/kongplugin-${PLUGIN_TYPE}.yaml`;

function manifestTemplate(): string {
  // `echo_downstream: false` is the documented v1 behavior — a constant
  // baked into the template, not a promoted field.
  return `apiVersion: configuration.konghq.com/v1
kind: KongPlugin
metadata:
  name: {{ .Release.Name }}-${PLUGIN_TYPE}
plugin: ${PLUGIN_TYPE}
config:
  header_name: {{ .Values.kongPlugins.correlationId.headerName | quote }}
  echo_downstream: false
`;
}

/**
 * Adapter for Kong's `correlation-id` plugin, golden-path v1 scope: only the
 * header name (design 02: "correlation header" in the chart idiom).
 */
export const correlationIdAdapter: KongPluginAdapter = {
  pluginType: PLUGIN_TYPE,
  sensitive: false,

  toChartEdits(liveConfig: NormalizedConfig): FileEdit[] {
    const headerName = liveConfig.header_name;
    if (typeof headerName !== 'string' || headerName.length === 0) {
      throw new Error(
        `correlation-id promotion requires a non-empty string 'header_name' field in the live config, got ${JSON.stringify(headerName)}`,
      );
    }

    return [
      {
        path: 'chart/values.yaml',
        op: 'merge',
        values: { kongPlugins: { correlationId: { headerName } } },
      },
      { path: TEMPLATE_PATH, op: 'create', content: manifestTemplate() },
    ];
  },

  fromRendered(kongPluginManifest: Record<string, unknown>): NormalizedConfig {
    const config = (kongPluginManifest.config ?? {}) as Record<string, unknown>;
    return { header_name: String(config.header_name) };
  },
};
