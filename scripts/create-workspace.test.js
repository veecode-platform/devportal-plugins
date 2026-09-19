const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const generator = path.join(repoRoot, 'scripts', 'create-workspace.js');
const generatorModule = require(generator);

function runGenerator(name, role) {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devportal-workspace-'));
  execFileSync(process.execPath, [generator, name, '--role', role, '--output-root', outputRoot], {
    cwd: repoRoot,
    stdio: 'pipe',
    encoding: 'utf8',
  });
  return path.join(outputRoot, name);
}

function allTextFiles(root) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const filePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...allTextFiles(filePath));
    } else if (!entry.isSymbolicLink()) {
      files.push(filePath);
    }
  }
  return files;
}

function assertNoTemplateTokens(root) {
  for (const filePath of allTextFiles(root)) {
    const content = fs.readFileSync(filePath);
    if (content.includes(0)) continue;
    const text = content.toString('utf8');
    assert.doesNotMatch(text, /\{\{[^}]+\}\}/, filePath);
    assert.doesNotMatch(text, /dummy/i, filePath);
  }
}

function workspaceSnapshot(root) {
  return allTextFiles(root)
    .map(filePath => [
      path.relative(root, filePath),
      fs.readFileSync(filePath),
    ])
    .sort(([left], [right]) => left.localeCompare(right));
}

test('creates a frontend-plugin workspace with an app harness', () => {
  const workspace = runGenerator('hello', 'frontend-plugin');
  const rootPackage = JSON.parse(fs.readFileSync(path.join(workspace, 'package.json')));
  const pluginPackage = JSON.parse(
    fs.readFileSync(path.join(workspace, 'plugins', 'hello', 'package.json')),
  );

  assert.equal(rootPackage.name, 'hello');
  assert.equal(pluginPackage.name, '@veecode-platform/backstage-plugin-hello');
  assert.equal(pluginPackage.backstage.role, 'frontend-plugin');
  assert.ok(fs.existsSync(path.join(workspace, 'packages', 'app')));
  assert.ok(fs.existsSync(path.join(workspace, 'playwright.config.ts')));
  assert.ok(fs.existsSync(path.join(workspace, 'e2e-tests', 'app.test.ts')));
  assert.ok(fs.existsSync(path.join(workspace, '.changeset', 'config.json')));
  assert.ok(fs.existsSync(path.join(workspace, 'dynamic-plugins.yaml')));
  assert.ok(fs.existsSync(path.join(workspace, 'yarn.lock')));
  assert.ok(fs.existsSync(path.join(workspace, 'AGENTS.md')));
  const agents = fs.readFileSync(path.join(workspace, 'AGENTS.md'), 'utf8');
  assert.match(agents, /harness is `packages\/app plus Playwright`/);
  assert.doesNotMatch(agents, /``/);
  const dynamicConfig = fs.readFileSync(
    path.join(workspace, 'dynamic-plugins.yaml'),
    'utf8',
  );
  assert.match(dynamicConfig, /path: \/hello/);
  assert.match(dynamicConfig, /importName: HelloPage/);
  const playwrightConfig = fs.readFileSync(
    path.join(workspace, 'playwright.config.ts'),
    'utf8',
  );
  assert.match(playwrightConfig, /PLAYWRIGHT_URL/);
  assert.doesNotMatch(playwrightConfig, /PLAYWRIGHT_TARGET/);
  const app = fs.readFileSync(
    path.join(workspace, 'packages', 'app', 'src', 'App.tsx'),
    'utf8',
  );
  assert.match(app, /path="\/hello"/);
  const lock = fs.readFileSync(path.join(workspace, 'yarn.lock'), 'utf8');
  assert.match(lock, /"hello@workspace:\.":/);
  assert.ok(lock.indexOf('"hello@workspace:.":') > 0);
  assertNoTemplateTokens(workspace);
});

test('creates a backend-plugin workspace with a backend harness', () => {
  const workspace = runGenerator('hello', 'backend-plugin');
  const rootPackage = JSON.parse(fs.readFileSync(path.join(workspace, 'package.json')));
  const pluginPackage = JSON.parse(
    fs.readFileSync(path.join(workspace, 'plugins', 'hello-backend', 'package.json')),
  );

  assert.equal(rootPackage.name, 'hello');
  assert.equal(pluginPackage.name, '@veecode-platform/backstage-plugin-hello-backend');
  assert.equal(pluginPackage.backstage.role, 'backend-plugin');
  assert.ok(fs.existsSync(path.join(workspace, 'packages', 'backend')));
  assert.ok(!fs.existsSync(path.join(workspace, 'packages', 'app')));
  assert.ok(fs.existsSync(path.join(workspace, 'dynamic-plugins.yaml')));
  assert.ok(fs.existsSync(path.join(workspace, 'yarn.lock')));
  assert.ok(fs.existsSync(path.join(workspace, 'AGENTS.md')));
  const agents = fs.readFileSync(path.join(workspace, 'AGENTS.md'), 'utf8');
  assert.match(agents, /harness is `packages\/backend plus backend unit tests`/);
  assert.doesNotMatch(agents, /``/);
  assertNoTemplateTokens(workspace);
});

test('rejects an unsupported role before creating a workspace', () => {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devportal-workspace-'));

  assert.throws(
    () =>
      execFileSync(
        process.execPath,
        [generator, 'hello', '--role', 'common-library', '--output-root', outputRoot],
        { cwd: repoRoot, stdio: 'pipe', encoding: 'utf8' },
      ),
    /Unsupported role/,
  );
  assert.deepEqual(fs.readdirSync(outputRoot), []);
});

test('rejects flags without values before creating a workspace', () => {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devportal-workspace-'));

  for (const args of [
    ['hello', '--role'],
    ['hello', '--role', '--output-root', outputRoot],
    ['hello', '--role', 'frontend-plugin', '--output-root'],
  ]) {
    assert.throws(
      () => execFileSync(process.execPath, [generator, ...args], {
        cwd: repoRoot,
        stdio: 'pipe',
        encoding: 'utf8',
      }),
      /requires a value/,
    );
  }

  assert.deepEqual(fs.readdirSync(outputRoot), []);
});

test('does not overwrite a destination that already exists', () => {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devportal-workspace-'));
  const destination = path.join(outputRoot, 'hello');
  fs.mkdirSync(destination);
  const sentinel = path.join(destination, 'keep-me.txt');
  fs.writeFileSync(sentinel, 'existing workspace');

  assert.throws(
    () => generatorModule.createWorkspace({
      name: 'hello',
      role: 'frontend-plugin',
      outputRoot,
    }),
    /Workspace already exists/,
  );
  assert.equal(fs.readFileSync(sentinel, 'utf8'), 'existing workspace');
});

test('rolls back only the destination created by a failed execution', () => {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devportal-workspace-'));
  const originalWriteFileSync = fs.writeFileSync;
  let failedWrite = false;
  fs.writeFileSync = (...args) => {
    if (!failedWrite && String(args[0]).startsWith(outputRoot)) {
      failedWrite = true;
      throw new Error('injected copy failure');
    }
    return originalWriteFileSync(...args);
  };

  try {
    assert.throws(
      () => generatorModule.createWorkspace({
        name: 'hello',
        role: 'frontend-plugin',
        outputRoot,
      }),
      /injected copy failure/,
    );
  } finally {
    fs.writeFileSync = originalWriteFileSync;
  }

  assert.deepEqual(fs.readdirSync(outputRoot), []);
});

test('generates deterministic content for the same input', () => {
  const firstRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devportal-workspace-'));
  const secondRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devportal-workspace-'));
  const first = generatorModule.createWorkspace({
    name: 'hello',
    role: 'frontend-plugin',
    outputRoot: firstRoot,
  });
  const second = generatorModule.createWorkspace({
    name: 'hello',
    role: 'frontend-plugin',
    outputRoot: secondRoot,
  });

  assert.deepEqual(workspaceSnapshot(first), workspaceSnapshot(second));
});
