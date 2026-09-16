import { execFile } from 'child_process';
import { promisify } from 'util';
import { isDeepStrictEqual } from 'util';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { Document, isMap, parseDocument } from 'yaml';
import { FileEdit, KongPluginAdapter, NormalizedConfig } from './adapters/types';

const execFileAsync = promisify(execFile);

/** Caps `helm template` output captured via execFile — normal chart output is KB-sized; this only guards against a runaway render. */
const HELM_MAX_BUFFER_BYTES = 10 * 1024 * 1024;

/**
 * Materializes a list of `FileEdit`s onto a repo checkout on disk (edit
 * paths are repo-relative, e.g. `chart/values.yaml` — the golden-path
 * convention of a `chart/` subdirectory at the repo root). Used both by the
 * generation-time equivalence check below and (later, P3) to build the
 * commit content for the promotion MR.
 */
export async function applyFileEdits(repoDir: string, edits: FileEdit[]): Promise<void> {
  for (const edit of edits) {
    const targetPath = path.join(repoDir, edit.path);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });

    if (edit.op === 'create') {
      await fs.writeFile(targetPath, edit.content, 'utf8');
      continue;
    }

    // Comment-preserving merge (#126): edit the YAML document in place with
    // the `yaml` Document API instead of a load/dump round-trip, so every
    // comment, quoting style and key order the adapter does not touch
    // survives — the golden chart documents its `kongPlugins` idiom inline,
    // and the promote MR must read as a minimal diff.
    let doc: Document.Parsed | Document;
    try {
      doc = parseDocument(await fs.readFile(targetPath, 'utf8'));
      if (doc.errors.length > 0) {
        throw new Error(`${edit.path}: ${doc.errors.map(e => e.message).join('; ')}`);
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
      doc = new Document({});
    }
    if (!isMap(doc.contents)) {
      // Empty file or a scalar/sequence at the root: start a fresh mapping.
      doc.contents = doc.createNode({}) as any;
    }
    applyPatch(doc, edit.values, []);
    await fs.writeFile(targetPath, doc.toString(), 'utf8');
  }
}

/**
 * Deep-merges `patch` into `doc` at `basePath`: plain objects recurse (so
 * sibling keys and their comments stay untouched), everything else replaces
 * the node at that path. An `{}` placeholder (the fixture's `kongPlugins: {}`)
 * is a map too, so keys are added inside it rather than replacing it.
 */
function applyPatch(doc: Document, patch: Record<string, unknown>, basePath: string[]): void {
  for (const [key, value] of Object.entries(patch)) {
    const path = [...basePath, key];
    const existing = doc.getIn(path, true);
    if (isPlainObject(value) && isMap(existing)) {
      applyPatch(doc, value, path);
    } else {
      doc.setIn(path, value);
    }
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}


export interface EquivalenceResult {
  equal: boolean;
  /** Human-readable diff, present whenever `equal` is false. */
  diff?: string;
}

/**
 * Generation-time equivalence check (design 02, promotion mechanics step 3):
 * apply `edits` to `repoDir` (the service repo checkout, chart under
 * `chart/` per the golden-path convention), render the chart with
 * `helm template`, extract the `KongPlugin` manifest for
 * `adapter.pluginType`, normalize it, and compare against `liveConfig`. A
 * mismatch — including a plugin type the rendered chart doesn't produce at
 * all — aborts with a diff instead of promoting a drifted config.
 */
export async function renderCheck(params: {
  repoDir: string;
  adapter: KongPluginAdapter;
  edits: FileEdit[];
  liveConfig: NormalizedConfig;
  releaseName?: string;
  /** `kong.promotion.helmPath` — resolved on PATH when a bare command. @default 'helm' */
  helmPath?: string;
  /** `kong.promotion.helmTimeoutSeconds`. @default 60 */
  helmTimeoutSeconds?: number;
}): Promise<EquivalenceResult> {
  const {
    repoDir,
    adapter,
    edits,
    liveConfig,
    releaseName = 'promotion-check',
    helmPath = 'helm',
    helmTimeoutSeconds = 60,
  } = params;

  await applyFileEdits(repoDir, edits);
  const chartDir = path.join(repoDir, 'chart');

  // The portal runs with a read-only root filesystem — helm must never fall
  // back to writing under `$HOME` (its default for cache/config/data). A
  // per-run scratch dir keeps every `helm template` invocation isolated and
  // writable, and is discarded regardless of outcome.
  const scratchDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kong-helm-'));

  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(helmPath, ['template', releaseName, chartDir], {
      timeout: helmTimeoutSeconds * 1000,
      maxBuffer: HELM_MAX_BUFFER_BYTES,
      env: {
        ...process.env,
        HELM_CACHE_HOME: scratchDir,
        HELM_CONFIG_HOME: scratchDir,
        HELM_DATA_HOME: scratchDir,
      },
    }));
  } catch (err) {
    const execErr = err as NodeJS.ErrnoException & { stderr?: string };
    if (execErr.code === 'ENOENT') {
      throw new Error(
        `helm CLI not found at "${helmPath}" — the deployment must provide the helm CLI and point kong.promotion.helmPath at it (see README, "Prerequisites")`,
      );
    }
    throw new Error(`helm template failed: ${execErr.stderr || execErr.message}`);
  } finally {
    await fs.rm(scratchDir, { recursive: true, force: true });
  }

  const manifests = yaml
    .loadAll(stdout)
    .filter((doc): doc is Record<string, unknown> => isPlainObject(doc))
    .filter(doc => doc.kind === 'KongPlugin' && doc.plugin === adapter.pluginType);

  if (manifests.length === 0) {
    return {
      equal: false,
      diff: `rendered chart has no KongPlugin manifest for plugin type '${adapter.pluginType}'`,
    };
  }
  if (manifests.length > 1) {
    // The chart declares the plugin type more than once (e.g. per-route
    // manifests reading the same value). `fromRendered` on the first one
    // can't tell which resource an edit would change, and committing the
    // shared value would silently change the others too — refuse rather
    // than pick one by render order.
    return {
      equal: false,
      diff: `rendered chart declares ${manifests.length} KongPlugin manifests of type '${adapter.pluginType}'; cannot determine which one an edit would change — edit the chart in the repository`,
    };
  }
  const manifest = manifests[0];

  const rendered = adapter.fromRendered(manifest);
  if (isDeepStrictEqual(rendered, liveConfig)) {
    return { equal: true };
  }

  return {
    equal: false,
    diff: [
      'live config (expected):',
      JSON.stringify(liveConfig, null, 2),
      'rendered config (actual):',
      JSON.stringify(rendered, null, 2),
    ].join('\n'),
  };
}
