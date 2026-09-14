jest.mock('child_process', () => ({
  execFile: jest.fn((_cmd: string, _args: string[], callback: (err: NodeJS.ErrnoException) => void) => {
    const err = new Error('spawn helm ENOENT') as NodeJS.ErrnoException;
    err.code = 'ENOENT';
    callback(err);
  }),
}));

import { renderCheck } from './renderCheck';
import { rateLimitingAdapter } from './adapters/rateLimiting';

describe('renderCheck without helm on PATH', () => {
  it('fails with a clear, actionable error instead of a raw ENOENT', async () => {
    await expect(
      renderCheck({
        repoDir: '/does-not-matter',
        adapter: rateLimitingAdapter,
        edits: [],
        liveConfig: { minute: 60 },
      }),
    ).rejects.toThrow('helm CLI not found on PATH — install helm to run the promotion equivalence check');
  });
});
