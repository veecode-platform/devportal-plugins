import * as fs from 'fs/promises';
import * as os from 'os';

type ExecFileOptions = { timeout?: number; maxBuffer?: number; env?: NodeJS.ProcessEnv };
type ExecFileCallback = (err: NodeJS.ErrnoException | null, result?: { stdout: string; stderr: string }) => void;

let capturedCmd: string | undefined;
let capturedArgs: string[] | undefined;
let capturedOptions: ExecFileOptions | undefined;

jest.mock('child_process', () => ({
  execFile: jest.fn(
    (cmd: string, args: string[], optionsOrCallback: unknown, maybeCallback?: ExecFileCallback) => {
      capturedCmd = cmd;
      capturedArgs = args;
      const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
      capturedOptions = typeof optionsOrCallback === 'function' ? undefined : (optionsOrCallback as ExecFileOptions);
      (callback as ExecFileCallback)(null, { stdout: '', stderr: '' });
    },
  ),
}));

import { renderCheck } from './renderCheck';
import { rateLimitingAdapter } from './adapters/rateLimiting';

describe('renderCheck helm invocation (env, timeout, path)', () => {
  beforeEach(() => {
    capturedCmd = undefined;
    capturedArgs = undefined;
    capturedOptions = undefined;
  });

  it('runs the configured helmPath with a scratch HELM_* env and the configured timeout, never $HOME', async () => {
    await renderCheck({
      repoDir: '/does-not-matter',
      adapter: rateLimitingAdapter,
      edits: [],
      liveConfig: { minute: 60 },
      helmPath: '/opt/helm/helm',
      helmTimeoutSeconds: 5,
    });

    expect(capturedCmd).toBe('/opt/helm/helm');
    expect(capturedArgs?.[0]).toBe('template');
    expect(capturedOptions?.timeout).toBe(5000);
    expect(typeof capturedOptions?.maxBuffer).toBe('number');

    const scratchDir = capturedOptions?.env?.HELM_CACHE_HOME;
    expect(scratchDir).toBeDefined();
    expect(scratchDir).toBe(capturedOptions?.env?.HELM_CONFIG_HOME);
    expect(scratchDir).toBe(capturedOptions?.env?.HELM_DATA_HOME);
    expect(scratchDir).not.toBe(os.homedir());

    // Cleaned up in `finally` regardless of outcome.
    await expect(fs.access(scratchDir as string)).rejects.toThrow();
  });

  it('defaults to a bare "helm" command and a 60s timeout when unconfigured', async () => {
    await renderCheck({
      repoDir: '/does-not-matter',
      adapter: rateLimitingAdapter,
      edits: [],
      liveConfig: { minute: 60 },
    });

    expect(capturedCmd).toBe('helm');
    expect(capturedOptions?.timeout).toBe(60000);
  });
});
