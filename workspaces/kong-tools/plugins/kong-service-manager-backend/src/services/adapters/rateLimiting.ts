import { FileEdit, KongPluginAdapter, NormalizedConfig } from './types';

const PLUGIN_TYPE = 'rate-limiting';
const VALUES_PATH = 'chart/values.yaml';
const VALUES_KEY_PATH = ['kongPlugins', 'rateLimiting'];
const TEMPLATE_PATH = `chart/templates/kongplugin-${PLUGIN_TYPE}.yaml`;

function manifestTemplate(): string {
  // `policy: local` is the documented v1 behavior (design 02: counters reset
  // when the plugin instance is replaced during the promotion swap) — a
  // constant baked into the template, not a promoted field.
  return `apiVersion: configuration.konghq.com/v1
kind: KongPlugin
metadata:
  name: {{ .Release.Name }}-${PLUGIN_TYPE}
plugin: ${PLUGIN_TYPE}
config:
  minute: {{ .Values.kongPlugins.rateLimiting.minute }}
  policy: local
`;
}

/**
 * Adapter for Kong's `rate-limiting` plugin, golden-path v1 scope: only the
 * per-minute limit (design 02: `kong.rateLimit.minute` in the chart idiom).
 */
export const rateLimitingAdapter: KongPluginAdapter = {
  pluginType: PLUGIN_TYPE,
  sensitive: false,

  toChartEdits(liveConfig: NormalizedConfig): FileEdit[] {
    const minute = liveConfig.minute;
    if (typeof minute !== 'number' || !Number.isFinite(minute) || minute <= 0) {
      // An edited config reaches here straight from the portal form (issue
      // #135), which — unlike Kong's own Admin API on the experiment path —
      // never validated it: a cleared numeric field arrives as 0, renders a
      // chart the check happily approves, and only fails once the Kong
      // Ingress Controller rejects the merged KongPlugin.
      throw new Error(
        `rate-limiting promotion requires a positive numeric 'minute' field in the live config, got ${JSON.stringify(minute)}`,
      );
    }

    return [
      {
        path: VALUES_PATH,
        op: 'merge',
        values: { kongPlugins: { rateLimiting: { minute } } },
      },
      { path: TEMPLATE_PATH, op: 'create', content: manifestTemplate() },
    ];
  },

  fromRendered(kongPluginManifest: Record<string, unknown>): NormalizedConfig {
    const config = (kongPluginManifest.config ?? {}) as Record<string, unknown>;
    return { minute: Number(config.minute) };
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
