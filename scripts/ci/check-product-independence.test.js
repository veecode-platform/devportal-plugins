const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  extractLintFindings,
  scanWorkspace,
  shippedSourceFiles,
} = require('./check-product-independence.js');

function makeWorkspace(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'devportal-product-check-'));

  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }

  return root;
}

test('finds dev shell package identities and paths in product metadata', () => {
  const root = makeWorkspace({
    'packages/app/package.json': JSON.stringify({ name: '@example/dev-app' }),
    'plugins/example/package.json': JSON.stringify({
      name: '@example/plugin',
      backstage: { pluginPackages: ['@example/plugin', '@example/dev-app'] },
      scalprum: { exposedModules: { './app': '../../packages/app/src/App.tsx' } },
      files: ['dist', '../../packages/backend/src'],
    }, null, 2),
  });

  assert.deepEqual(scanWorkspace(root), [
    {
      file: 'plugins/example/package.json',
      line: 6,
      message: 'backstage.pluginPackages references dev shell package @example/dev-app (packages/app)',
    },
    {
      file: 'plugins/example/package.json',
      line: 11,
      message: 'scalprum.exposedModules resolves into packages/app',
    },
    {
      file: 'plugins/example/package.json',
      line: 16,
      message: 'files entry resolves into packages/backend',
    },
  ]);
});

test('keeps the Backstage import rules and dev shell restrictions, nothing else', () => {
  const jsonOutput = JSON.stringify([
    {
      filePath: '/tmp/example/plugins/example/src/index.ts',
      messages: [
        {
          ruleId: '@backstage/no-undeclared-imports',
          line: 8,
          message: '@backstage/errors must be declared in dependencies of plugins/example/package.json',
        },
        {
          ruleId: '@backstage/no-relative-monorepo-imports',
          line: 3,
          message: "Relative imports of monorepo packages are forbidden, use 'app/src/App' instead",
        },
        {
          ruleId: 'no-restricted-syntax',
          line: 5,
          message: 'imports a dev shell package from packages/ (backend)',
        },
        {
          ruleId: 'no-restricted-syntax',
          line: 6,
          message: 'Using a labeled statement is not allowed.',
        },
        { ruleId: 'prettier/prettier', line: 9, message: 'formatting issue' },
      ],
    },
  ]);
  const findings = extractLintFindings(
    `Backstage CLI notice before JSON output\n${jsonOutput}`,
    '/tmp/example',
  );

  assert.deepEqual(findings, [
    {
      file: 'plugins/example/src/index.ts',
      line: 3,
      rule: '@backstage/no-relative-monorepo-imports',
      message: "Relative imports of monorepo packages are forbidden, use 'app/src/App' instead",
    },
    {
      file: 'plugins/example/src/index.ts',
      line: 5,
      rule: 'no-restricted-syntax',
      message: 'imports a dev shell package from packages/ (backend)',
    },
    {
      file: 'plugins/example/src/index.ts',
      line: 8,
      rule: '@backstage/no-undeclared-imports',
      message: '@backstage/errors must be declared in dependencies of plugins/example/package.json',
    },
  ]);
});

test('lints what the package ships: src and listed source, not build output', () => {
  const root = makeWorkspace({
    'plugins/example/package.json': JSON.stringify({
      name: '@example/plugin',
      files: ['dist', 'dist-dynamic', 'migrations', 'config.d.ts', 'README.md'],
    }),
    'plugins/example/src/index.ts': '',
    'plugins/example/migrations/001_init.js': '',
    'plugins/example/config.d.ts': '',
    'plugins/example/dist/index.cjs.js': '',
    'plugins/example/dist-dynamic/index.js': '',
    'plugins/example/dev/index.tsx': '',
    'plugins/example/README.md': '',
  });
  const pluginRoot = path.join(root, 'plugins/example');

  assert.deepEqual(
    shippedSourceFiles(pluginRoot).map(file => path.relative(pluginRoot, file)),
    ['config.d.ts', 'migrations/001_init.js', 'src/index.ts'],
  );
});
