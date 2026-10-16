const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const resolverScript = path.join(
  repoRoot,
  '.agents/skills/devportal-context/scripts/resolve-devportal-local-dir.sh',
);
const fixtureRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), 'resolve-devportal-local-dir-'),
);
test.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));

function createCheckout(directory) {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, '.chart-pin'), '');
  fs.writeFileSync(
    path.join(directory, 'docker-compose.yml'),
    'services: {}\n',
  );
  return fs.realpathSync(directory);
}

function createSideBySideLayout() {
  const caseRoot = fs.mkdtempSync(path.join(fixtureRoot, 'case-'));
  const siblingRoot = path.join(caseRoot, 'side');
  const scriptPath = path.join(
    siblingRoot,
    'devportal-plugins/.agents/skills/devportal-context/scripts/resolve-devportal-local-dir.sh',
  );
  fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
  fs.copyFileSync(resolverScript, scriptPath);
  return { scriptPath, siblingRoot };
}

function runResolver(scriptPath, env = {}) {
  return spawnSync('bash', [scriptPath], {
    encoding: 'utf8',
    env: { ...process.env, DEVPORTAL_LOCAL_DIR: '', ...env },
  });
}

test('a side-by-side clone resolves to its one devportal-local checkout', () => {
  const layout = createSideBySideLayout();
  const checkout = createCheckout(
    path.join(layout.siblingRoot, 'devportal-local'),
  );
  const result = runResolver(layout.scriptPath);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, `${checkout}\n`);
});

test('two different devportal-local checkouts still fail with the multiple-checkouts error', () => {
  const layout = createSideBySideLayout();
  createCheckout(path.join(layout.siblingRoot, 'devportal-local'));
  createCheckout(path.join(layout.siblingRoot, 'devportal-local-2'));
  const result = runResolver(layout.scriptPath);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /^Multiple devportal-local checkouts found:/);
});

test('DEVPORTAL_LOCAL_DIR wins over discovery when several checkouts exist', () => {
  const layout = createSideBySideLayout();
  createCheckout(path.join(layout.siblingRoot, 'devportal-local'));
  const chosen = createCheckout(
    path.join(layout.siblingRoot, 'devportal-local-2'),
  );
  const result = runResolver(layout.scriptPath, {
    DEVPORTAL_LOCAL_DIR: chosen,
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, `${chosen}\n`);
});
