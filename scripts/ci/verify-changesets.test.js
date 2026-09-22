const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { verifyChangesets } = require('./verify-changesets.js');

function createWorkspaceFixture(files, packageManifests = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'devportal-changesets-'));
  const changesetsDir = path.join(root, 'workspaces', 'example', '.changeset');
  fs.mkdirSync(changesetsDir, { recursive: true });

  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(changesetsDir, name), content);
  }

  for (const [relativePath, content] of Object.entries(packageManifests)) {
    const packagePath = path.join(root, 'workspaces', 'example', relativePath);
    fs.mkdirSync(path.dirname(packagePath), { recursive: true });
    fs.writeFileSync(packagePath, content);
  }

  return root;
}

test('reports changesets that release private workspace packages', async () => {
  const root = createWorkspaceFixture({
    'README.md': '# Changesets\n',
    'private.md': `---\n'app': patch\n'backend-dev': patch # local private package\n'@veecode-platform/backstage-plugin-example': minor\n---\n\nDescribe the change.\n`,
  }, {
    'packages/backend-dev/package.json': JSON.stringify({
      name: 'backend-dev',
      private: true,
    }),
  });

  const errors = await verifyChangesets(root, 'example');

  assert.deepEqual(errors, [
    {
      name: 'private.md',
      messages: [
        "Should not contain releases of the following packages since they are not published: 'app', 'backend-dev'",
      ],
    },
  ]);
});

test('ignores README and accepts a public-package changeset', async () => {
  const root = createWorkspaceFixture({
    'README.md': '# Changesets\n',
    'public.md': `---\n'@veecode-platform/backstage-plugin-example': patch\n---\n\nDescribe the change.\n`,
  });

  const errors = await verifyChangesets(root, 'example');

  assert.deepEqual(errors, []);
});

test('rejects malformed changeset release frontmatter', async () => {
  const root = createWorkspaceFixture({
    'README.md': '# Changesets\n',
    'malformed.md': `---\nbackend-dev patch\n---\n\nDescribe the change.\n`,
  });

  await assert.rejects(
    () => verifyChangesets(root, 'example'),
    /Invalid changeset release entry/,
  );
});
