/**
 * Per-plugin promotion adapters (design 02, promotion mechanics step 3).
 *
 * An adapter is the only thing that knows how a given Kong plugin type maps
 * onto the golden-path chart idiom: which `values.yaml` keys carry its
 * config, and what the generated `KongPlugin` manifest looks like. The
 * adapter registry (`./index.ts`) IS the promotion allowlist — a plugin type
 * with no adapter here can never be promoted, which is also the v1
 * sensitive-field gate (every registered adapter is `sensitive: false`).
 */

/** A Kong plugin config, normalized to only the fields an adapter manages. */
export type NormalizedConfig = Record<string, unknown>;

/**
 * One edit to apply to a target chart. Adapters are pure functions of the
 * live config (no chart context), so an edit describes *what* to change
 * rather than a full file diff:
 *
 * - `merge`: deep-merge `values` into the YAML document at `path` (creating
 *   it if absent), preserving every key the adapter doesn't touch. Used for
 *   `chart/values.yaml`.
 * - `create`: write `content` verbatim, creating the file if it doesn't
 *   exist and overwriting it (idempotently) if it does. Used for
 *   `chart/templates/kongplugin-<type>.yaml`.
 */
export type FileEdit =
  | { path: string; op: 'merge'; values: Record<string, unknown> }
  | { path: string; op: 'create'; content: string };

export interface KongPluginAdapter {
  /** Kong plugin name, e.g. `rate-limiting` — matches the Admin API and the rendered manifest's `plugin` field. */
  pluginType: string;
  /**
   * v1 sensitive-field gate: only plugins whose adapter manages no
   * secret-bearing field are promotable. Every adapter in the registry
   * must be `false` — there is no promotion path for `true` yet.
   */
  sensitive: false;
  /** Live plugin config (from the Kong Admin API, normalized) → chart edits. */
  toChartEdits(liveConfig: NormalizedConfig): FileEdit[];
  /** Rendered `KongPlugin` manifest (from `helm template`) → normalized config, for the generation-time equivalence check. */
  fromRendered(kongPluginManifest: Record<string, unknown>): NormalizedConfig;
}
