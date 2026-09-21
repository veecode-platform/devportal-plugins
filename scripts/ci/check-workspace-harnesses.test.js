const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { inspectWorkspace } = require('./check-workspace-harnesses');

function makeWorkspace(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'devportal-harness-'));
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }
  return root;
}

const frontendPackage = JSON.stringify({
  backstage: { role: 'frontend-plugin' },
});
const backendModulePackage = JSON.stringify({
  backstage: { role: 'backend-plugin-module' },
});

test('accepts a frontend workspace with an app and AGENTS sections', () => {
  const root = makeWorkspace({
    'AGENTS.md': '## Commands\n## Layout\n## Architecture\n## How to test\n## Pull requests and changesets\n',
    'plugins/example/package.json': frontendPackage,
    'packages/app/package.json': '{}',
    'playwright.config.ts': '',
    'packages/app/e2e-tests/app.test.ts': '',
  });

  assert.deepEqual(inspectWorkspace(root), []);
});

test('reports a backend module without its required backend harness', () => {
  const root = makeWorkspace({
    'AGENTS.md': '## Commands\n## Layout\n## Architecture\n## How to test\n## Pull requests and changesets\n',
    'plugins/example/package.json': backendModulePackage,
  });

  assert.deepEqual(inspectWorkspace(root), [
    'backend-plugin-module requires packages/backend',
  ]);
});

test('reports a catalog module without a fixture', () => {
  const root = makeWorkspace({
    'AGENTS.md': '## Commands\n## Layout\n## Architecture\n## How to test\n## Pull requests and changesets\n',
    'plugins/example/package.json': JSON.stringify({
      backstage: { role: 'backend-plugin-module', pluginId: 'catalog' },
    }),
    'packages/backend/package.json': '{}',
  });

  assert.deepEqual(inspectWorkspace(root), [
    'backend-plugin-module catalog requires a YAML fixture in fixtures/',
  ]);
});

test('reports a workspace without the mandatory AGENTS sections', () => {
  const root = makeWorkspace({
    'plugins/example/package.json': frontendPackage,
  });

  assert.deepEqual(inspectWorkspace(root), [
    'AGENTS.md is missing',
    'AGENTS.md is missing section: Commands',
    'AGENTS.md is missing section: Layout',
    'AGENTS.md is missing section: Architecture',
    'AGENTS.md is missing section: How to test',
    'AGENTS.md is missing section: Pull requests and changesets',
    'frontend-plugin requires packages/app',
    'frontend-plugin requires playwright.config.ts',
    'frontend-plugin requires e2e-tests/',
  ]);
});

test('reports a workspace without a product plugin package', () => {
  const root = makeWorkspace({
    'AGENTS.md': '## Commands\n## Layout\n## Architecture\n## How to test\n## Pull requests and changesets\n',
  });

  assert.deepEqual(inspectWorkspace(root), [
    'at least one plugin package is required',
  ]);
});
