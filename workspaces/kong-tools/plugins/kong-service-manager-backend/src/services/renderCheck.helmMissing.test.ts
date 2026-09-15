jest.mock('child_process', () => ({
  // execFile is called with (cmd, args, options, callback) once options are
  // passed (as renderCheck now does, for timeout/maxBuffer/env) — accept
  // either arity so this mock keeps working regardless.
  execFile: jest.fn(
    (
      _cmd: string,
      _args: string[],
      optionsOrCallback: unknown,
      maybeCallback?: (err: NodeJS.ErrnoException) => void,
    ) => {
      const err = new Error('spawn helm ENOENT') as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
      (callback as (err: NodeJS.ErrnoException) => void)(err);
    },
  ),
}));

import { renderCheck } from './renderCheck';
import { rateLimitingAdapter } from './adapters/rateLimiting';

describe('renderCheck without helm on PATH', () => {
  it('fails with a clear, actionable error naming the configured path instead of a raw ENOENT', async () => {
    await expect(
      renderCheck({
        repoDir: '/does-not-matter',
        adapter: rateLimitingAdapter,
        edits: [],
        liveConfig: { minute: 60 },
        helmPath: '/opt/helm/helm',
      }),
    ).rejects.toThrow(
      'helm CLI not found at "/opt/helm/helm" — the deployment must provide the helm CLI and point kong.promotion.helmPath at it (see README, "Prerequisites")',
    );
  });
});
