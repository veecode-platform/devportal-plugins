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
  execFileSync(process.execPath, [generator, name, '--role', role, '--output-root', outputRoot, '--shell-only'], {
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

test('creates a frontend-plugin workspace shell with an app harness', () => {
  const workspace = runGenerator('hello', 'frontend-plugin');
  const rootPackage = JSON.parse(fs.readFileSync(path.join(workspace, 'package.json')));

  assert.equal(rootPackage.name, 'hello');
  assert.ok(!fs.existsSync(path.join(workspace, 'plugins')));
  assert.equal(fs.readFileSync(path.join(workspace, 'yarn.lock'), 'utf8'), '');
  assert.ok(fs.existsSync(path.join(workspace, 'packages', 'app')));
  assert.ok(fs.existsSync(path.join(workspace, 'playwright.config.ts')));
  assert.ok(fs.existsSync(path.join(workspace, 'e2e-tests', 'app.test.ts')));
  assert.ok(fs.existsSync(path.join(workspace, '.changeset', 'config.json')));
  assert.ok(fs.existsSync(path.join(workspace, 'dynamic-plugins.yaml')));
  assert.ok(fs.existsSync(path.join(workspace, 'AGENTS.md')));
  const agents = fs.readFileSync(path.join(workspace, 'AGENTS.md'), 'utf8');
  assert.match(agents, /harness is `packages\/app plus Playwright`/);
  assert.match(agents, /PLAYWRIGHT_URL/);
  assert.doesNotMatch(agents, /source for generated/);
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
  assert.doesNotMatch(app, /backstage-plugin-hello/);
  assertNoTemplateTokens(workspace);
});

test('creates a backend-plugin workspace shell with a backend harness', () => {
  const workspace = runGenerator('hello', 'backend-plugin');
  const rootPackage = JSON.parse(fs.readFileSync(path.join(workspace, 'package.json')));

  assert.equal(rootPackage.name, 'hello');
  assert.ok(fs.existsSync(path.join(workspace, 'packages', 'backend')));
  assert.ok(!fs.existsSync(path.join(workspace, 'plugins')));
  const backendIndex = fs.readFileSync(
    path.join(workspace, 'packages', 'backend', 'src', 'index.ts'),
    'utf8',
  );
  assert.doesNotMatch(backendIndex, /backstage-plugin-hello/);
  assert.ok(!fs.existsSync(path.join(workspace, 'packages', 'app')));
  assert.ok(fs.existsSync(path.join(workspace, 'dynamic-plugins.yaml')));
  assert.ok(fs.existsSync(path.join(workspace, 'AGENTS.md')));
  const agents = fs.readFileSync(path.join(workspace, 'AGENTS.md'), 'utf8');
  assert.match(agents, /harness is `packages\/backend plus backend unit tests`/);
  assert.match(agents, /\/api\/hello\/health/);
  assert.doesNotMatch(agents, /Playwright/);
  assert.doesNotMatch(agents, /source for generated/);
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
        shellOnly: true,
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
    shellOnly: true,
  });
  const second = generatorModule.createWorkspace({
    name: 'hello',
    role: 'frontend-plugin',
    outputRoot: secondRoot,
    shellOnly: true,
  });

  assert.deepEqual(workspaceSnapshot(first), workspaceSnapshot(second));
});

test('grafts the dynamic-export fields onto what backstage-cli new writes', () => {
  const upstream = {
    name: '@veecode-platform/backstage-plugin-hello',
    backstage: { role: 'frontend-plugin', pluginId: 'hello' },
    scripts: { build: 'backstage-cli package build' },
  };
  const grafted = generatorModule.graftProductManifest(upstream, {
    role: 'frontend-plugin',
    packageName: upstream.name,
  });

  assert.equal(grafted.private, true);
  assert.deepEqual(grafted.backstage, {
    role: 'frontend-plugin',
    pluginId: 'hello',
    pluginPackages: ['@veecode-platform/backstage-plugin-hello'],
  });
  assert.equal(grafted.scripts.build, 'backstage-cli package build');
  assert.match(grafted.scripts['export-dynamic'], /plugin export$/);
  assert.deepEqual(grafted.scalprum, {
    name: 'veecode-platform.backstage-plugin-hello',
    exposedModules: { PluginRoot: './src/index.ts' },
  });

  const backend = generatorModule.graftProductManifest(
    { name: '@veecode-platform/backstage-plugin-hello-backend', backstage: {}, scripts: {} },
    { role: 'backend-plugin', packageName: '@veecode-platform/backstage-plugin-hello-backend' },
  );
  assert.equal(backend.scalprum, undefined);
});

test('declares /health unauthenticated in the generated backend plugin', () => {
  const pluginSource = [
    "      async init({ httpAuth, httpRouter, todoList }) {",
    '        httpRouter.use(',
    '          await createRouter({',
    '            httpAuth,',
    '            todoList,',
    '          }),',
    '        );',
    '      },',
    '',
  ].join('\n');
  const patched = generatorModule.addHealthPolicy(pluginSource);

  assert.equal(
    patched,
    [
      "      async init({ httpAuth, httpRouter, todoList }) {",
      '        httpRouter.use(',
      '          await createRouter({',
      '            httpAuth,',
      '            todoList,',
      '          }),',
      '        );',
      '        httpRouter.addAuthPolicy({',
      "          path: '/health',",
      "          allow: 'unauthenticated',",
      '        });',
      '      },',
      '',
    ].join('\n'),
  );
  assert.throws(
    () => generatorModule.addHealthPolicy('export const x = 1;\n'),
    /template changed shape/,
  );
});

test('adds the health route to the generated router', () => {
  const routerSource = '  const router = Router();\n  router.use(express.json());\n';
  const patched = generatorModule.addHealthRoute(routerSource);

  assert.equal(
    patched,
    [
      '  const router = Router();',
      "  router.get('/health', (_req, res) => {",
      "    res.json({ status: 'ok' });",
      '  });',
      '  router.use(express.json());',
      '',
    ].join('\n'),
  );
  assert.throws(
    () => generatorModule.addHealthRoute('const r = 1;\n'),
    /template changed shape/,
  );
});

test('writes a health test that calls the route without credentials', () => {
  const source = generatorModule.healthTestSource({
    name: 'hello-world',
    camelName: 'helloWorld',
  });

  assert.match(source, /import \{ helloWorldPlugin \} from '\.\/plugin';/);
  assert.match(source, /get\('\/api\/hello-world\/health'\)/);
  assert.doesNotMatch(source, /Authorization|token/i);
});

test('asks backstage-cli new for the template that matches the dev shell', () => {
  assert.deepEqual(generatorModule.templateCandidatesFor('frontend-plugin'), [
    'frontend-plugin-legacy',
    'frontend-plugin',
  ]);
  assert.deepEqual(generatorModule.templateCandidatesFor('backend-plugin'), ['backend-plugin']);
});
