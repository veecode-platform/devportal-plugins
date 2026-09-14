import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

/**
 * Copies the golden-path fixture repo (generic, test-only — modeled on the
 * platform's golden-path Backstage Node service skeleton, not on any real
 * repo) into a throwaway directory, so tests can apply FileEdits without
 * mutating the checked-in fixture.
 */
export async function copyGoldenPathRepo(): Promise<string> {
  const source = path.join(__dirname, 'golden-path-repo');
  const dest = await fs.mkdtemp(path.join(os.tmpdir(), 'kong-promotion-fixture-'));
  await fs.cp(source, dest, { recursive: true });
  return dest;
}
