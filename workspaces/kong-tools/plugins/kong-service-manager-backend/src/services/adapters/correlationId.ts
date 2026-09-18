import { FileEdit, KongPluginAdapter, NormalizedConfig } from './types';

const PLUGIN_TYPE = 'correlation-id';
const VALUES_PATH = 'chart/values.yaml';
const VALUES_KEY_PATH = ['kongPlugins', 'correlationId'];
const TEMPLATE_PATH = `chart/templates/kongplugin-${PLUGIN_TYPE}.yaml`;

/** Kong's own defaults for the two fields we promote (Admin API always returns them). */
const DEFAULT_GENERATOR = 'uuid#counter';
const DEFAULT_ECHO_DOWNSTREAM = false;

function manifestTemplate(): string {
  // All three behaviour-bearing fields are promoted (#127): the golden-path
  // chart ships `echo_downstream: true` + `generator: uuid`, so a constant
  // here would silently flip the edge behaviour on promotion.
  return `apiVersion: configuration.konghq.com/v1
kind: KongPlugin
metadata:
  name: {{ .Release.Name }}-${PLUGIN_TYPE}
plugin: ${PLUGIN_TYPE}
config:
  header_name: {{ .Values.kongPlugins.correlationId.headerName | quote }}
  generator: {{ .Values.kongPlugins.correlationId.generator | default "${DEFAULT_GENERATOR}" | quote }}
  echo_downstream: {{ .Values.kongPlugins.correlationId.echoDownstream | default ${DEFAULT_ECHO_DOWNSTREAM} }}
`;
}

/**
 * Adapter for Kong's `correlation-id` plugin: header name, id generator and
 * whether the header is echoed to the caller (`kongPlugins.correlationId.*`
 * in the chart idiom).
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
    const generator = typeof liveConfig.generator === 'string' ? liveConfig.generator : DEFAULT_GENERATOR;
    const echoDownstream =
      typeof liveConfig.echo_downstream === 'boolean' ? liveConfig.echo_downstream : DEFAULT_ECHO_DOWNSTREAM;

    return [
      {
        path: VALUES_PATH,
        op: 'merge',
        values: { kongPlugins: { correlationId: { headerName, generator, echoDownstream } } },
      },
      { path: TEMPLATE_PATH, op: 'create', content: manifestTemplate() },
    ];
  },

  fromRendered(kongPluginManifest: Record<string, unknown>): NormalizedConfig {
    const config = (kongPluginManifest.config ?? {}) as Record<string, unknown>;
    return {
      header_name: String(config.header_name),
      generator: typeof config.generator === 'string' ? config.generator : DEFAULT_GENERATOR,
      echo_downstream:
        typeof config.echo_downstream === 'boolean'
          ? config.echo_downstream
          : String(config.echo_downstream) === 'true',
    };
  },

  expectedTemplate(): { path: string; content: string } {
    return { path: TEMPLATE_PATH, content: manifestTemplate() };
  },

  toChartRemoval(): FileEdit[] {
    return [
      { path: VALUES_PATH, op: 'delete-key', keyPath: VALUES_KEY_PATH },
      { path: TEMPLATE_PATH, op: 'delete' },
    ];
  },
};
