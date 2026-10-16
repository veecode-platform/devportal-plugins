const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const exportScript = path.join(
  repoRoot,
  '.agents/skills/devportal-context/scripts/export-dev-dynamic.sh',
);
const evidenceRoot = path.join(
  repoRoot,
  '.p3-evidence',
  `export-dev-dynamic-tests-${process.pid}`,
);

fs.mkdirSync(evidenceRoot, { recursive: true });
test.after(() => fs.rmSync(evidenceRoot, { recursive: true, force: true }));

function writeExecutable(filePath, contents) {
  fs.writeFileSync(filePath, contents);
  fs.chmodSync(filePath, 0o755);
}

function flattenPackageName(name) {
  return name.replace(/^@/, '').replace('/', '-');
}

function createFixture(options = {}) {
  const caseRoot = fs.mkdtempSync(path.join(evidenceRoot, 'case-'));
  const checkoutRoot = path.join(caseRoot, 'checkout');
  const workspaceRoot = path.join(checkoutRoot, 'workspaces', 'sample');
  const pluginRoot = path.join(workspaceRoot, 'plugins', 'sample');
  const runnerRoot = path.join(caseRoot, 'devportal-local');
  const binRoot = path.join(caseRoot, 'bin');
  const packageName =
    options.packageName ?? '@veecode-platform/backstage-plugin-sample';
  const dynamicPackageName =
    options.dynamicPackageName ?? `${packageName}-dynamic`;
  const exportDirectory =
    options.exportDirectory ??
    flattenPackageName(dynamicPackageName).replace(/-dynamic$/, '');
  const dynamicPackageBase = flattenPackageName(dynamicPackageName);
  const workspaceReference =
    options.workspaceReference ??
    `./dynamic-plugins/dist/${dynamicPackageBase}`;
  const pluginManifest = {
    name: packageName,
    backstage: { role: options.role ?? 'frontend-plugin' },
    dependencies: options.dependencies ?? {},
    scripts: options.scripts ?? {},
  };

  fs.mkdirSync(pluginRoot, { recursive: true });
  fs.mkdirSync(runnerRoot, { recursive: true });
  fs.mkdirSync(binRoot, { recursive: true });
  fs.writeFileSync(
    path.join(pluginRoot, 'package.json'),
    `${JSON.stringify(pluginManifest, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(workspaceRoot, 'dynamic-plugins.yaml'),
    [
      'plugins:',
      `  - package: ${workspaceReference}`,
      '    disabled: false',
      ...(options.additionalReferences ?? []).map(
        reference => `  - package: ${reference}`,
      ),
      '',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(runnerRoot, 'dynamic-plugins.yaml'),
    'includes:\n  - dynamic-plugins.default.yaml\nplugins: []\n',
  );
  fs.writeFileSync(
    path.join(runnerRoot, 'docker-compose.yml'),
    'services:\n  install-dynamic-plugins:\n    environment:\n' +
      '      CATALOG_INDEX_IMAGE: quay.io/veecode/test-index@sha256:' +
      'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n',
  );

  const helperPath = path.join(
    checkoutRoot,
    '.agents/skills/devportal-context/scripts/export-dev-dynamic.sh',
  );
  const resolverPath = path.join(
    checkoutRoot,
    '.agents/skills/devportal-context/scripts/resolve-devportal-local-dir.sh',
  );
  fs.mkdirSync(path.dirname(helperPath), { recursive: true });
  fs.copyFileSync(exportScript, helperPath);
  writeExecutable(
    resolverPath,
    '#!/usr/bin/env bash\nprintf \'%s\\n\' "$DEVPORTAL_LOCAL_DIR"\n',
  );

  writeExecutable(
    path.join(binRoot, 'yarn'),
    '#!/usr/bin/env bash\n[[ "${1:-}" == tsc ]] || exit 64\n',
  );
  writeExecutable(
    path.join(binRoot, 'npx'),
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'printf \'%s\\n\' "$@" > "$CLI_ARGS_LOG"',
      'mkdir -p dist-dynamic',
      'printf \'{"name":"%s"}\\n\' "$DYNAMIC_PACKAGE_NAME" > dist-dynamic/package.json',
      'mkdir -p "$DEVPORTAL_LOCAL_DIR/dynamic-plugins-src-dev/$EXPORT_DIRECTORY"',
      '',
    ].join('\n'),
  );
  writeExecutable(
    path.join(binRoot, 'docker'),
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'case "${1:-}" in',
      '  run)',
      '    file_path="${@: -1}"',
      '    printf \'%s\\n\' "$file_path" >> "$DOCKER_READ_LOG"',
      '    case "$file_path" in',
      '      */factory-plugins.yaml) [[ -f "$FACTORY_CONFIG" ]] && cat "$FACTORY_CONFIG" ;;',
      '      */dynamic-plugins.veecode.yaml) [[ -f "$FACE_CONFIG" ]] && cat "$FACE_CONFIG" ;;',
      '      *) exit 65 ;;',
      '    esac ;;',
      '  create) [[ "${@: -1}" == /bin/true ]] || exit 66; printf \'test-index-container\\n\' ;;',
      '  cp)',
      '    printf \'/dynamic-plugins.default.yaml\\n\' >> "$DOCKER_READ_LOG"',
      '    [[ -f "$INDEX_CONFIG" ]] && cat "$INDEX_CONFIG" > "${@: -1}" ;;',
      '  rm) exit 0 ;;',
      '  *) exit 65 ;;',
      'esac',
      '',
    ].join('\n'),
  );

  const factoryConfigPath = path.join(caseRoot, 'factory-plugins.yaml');
  const indexConfigPath = path.join(caseRoot, 'dynamic-plugins.default.yaml');
  const faceConfigPath = path.join(caseRoot, 'dynamic-plugins.veecode.yaml');
  const dockerReadLog = path.join(caseRoot, 'docker-read.log');
  const cliArgsLog = path.join(caseRoot, 'cli-args.log');
  if (options.factoryConfig !== undefined) {
    fs.writeFileSync(factoryConfigPath, options.factoryConfig);
  }
  if (options.indexConfig !== undefined) {
    fs.writeFileSync(indexConfigPath, options.indexConfig);
  }
  if (options.faceConfig !== undefined) {
    fs.writeFileSync(faceConfigPath, options.faceConfig);
  }

  return {
    caseRoot,
    checkoutRoot,
    workspaceRoot,
    pluginRoot,
    runnerRoot,
    dockerReadLog,
    cliArgsLog,
    dynamicPackageName,
    exportDirectory,
    factoryConfigPath,
    faceConfigPath,
    run(pluginArguments = ['plugins/sample']) {
      const result = spawnSync('bash', [helperPath, ...pluginArguments], {
        cwd: workspaceRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${binRoot}${path.delimiter}${process.env.PATH}`,
          DEVPORTAL_LOCAL_DIR: runnerRoot,
          DEVPORTAL_IMAGE: 'docker.io/veecode/devportal:test',
          FACTORY_CONFIG: factoryConfigPath,
          INDEX_CONFIG: indexConfigPath,
          FACE_CONFIG: faceConfigPath,
          DOCKER_READ_LOG: dockerReadLog,
          CLI_ARGS_LOG: cliArgsLog,
          DYNAMIC_PACKAGE_NAME: dynamicPackageName,
          EXPORT_DIRECTORY: exportDirectory,
          TMPDIR: caseRoot,
        },
      });
      return result;
    },
  };
}

const factoryReference =
  'oci://quay.io/veecode/backstage-plugin-sample@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!veecode-platform-backstage-plugin-sample-dynamic';
const factoryIndexReference =
  'oci://quay.io/veecode/backstage-plugin-sample@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const factoryConfig = [
  'factoryPlugins:',
  '  - repository: quay.io/veecode/backstage-plugin-sample',
  '    path: veecode-platform-backstage-plugin-sample-dynamic',
  '',
].join('\n');
const indexConfig = [
  'plugins:',
  `  - package: ${factoryIndexReference}`,
  '    disabled: false',
  '',
].join('\n');
const faceConfig = [
  'plugins:',
  `  - package: ${factoryReference}`,
  '    disabled: false',
  '',
].join('\n');

test('reads the 3.1 factory list first and disables the matching index plugin', () => {
  const fixture = createFixture({
    factoryConfig,
    indexConfig,
    workspaceReference:
      './dynamic-plugins/dist/veecode-platform-backstage-plugin-sample-dynamic',
  });
  const result = fixture.run();

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    fs.readFileSync(fixture.dockerReadLog, 'utf8').trim().split('\n'),
    [
      '/opt/app-root/src/factory-plugins.yaml',
      '/dynamic-plugins.default.yaml',
    ],
  );
  const localConfig = fs.readFileSync(
    path.join(
      fixture.runnerRoot,
      'dynamic-plugins-root-dev/dynamic-plugins.local.yaml',
    ),
    'utf8',
  );
  assert.ok(localConfig.includes(factoryReference));
  assert.match(localConfig, /disabled: true/);
  assert.match(
    localConfig,
    /package: \.\/dynamic-plugins-src\/veecode-platform-backstage-plugin-sample\n/,
  );
  assert.match(
    fs.readFileSync(
      path.join(
        fixture.runnerRoot,
        'dynamic-plugins-root-dev/docker-compose.dynamic-plugins-root.local.yml',
      ),
      'utf8',
    ),
    /dynamic-plugins-src-dev:\/opt\/app-root\/src\/dynamic-plugins-src/,
  );

  const cliArgs = fs.readFileSync(fixture.cliArgsLog, 'utf8').trim().split('\n');
  assert.deepEqual(cliArgs.slice(0, 4), [
    '--yes',
    '--package=@red-hat-developer-hub/cli@1.11.2',
    'rhdh-cli',
    'plugin',
  ]);
  assert.equal(cliArgs[4], 'export');
});

test('falls back to the product-face file when a 3.0 image has no factory list', () => {
  const faceReference =
    'oci://quay.io/veecode/legacy-plugin!veecode-platform-backstage-plugin-sample-dynamic';
  const fixture = createFixture({
    faceConfig: [
      'plugins:',
      `  - package: ${faceReference}`,
      '    disabled: false',
      '',
    ].join('\n'),
  });
  const result = fixture.run();

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    fs.readFileSync(fixture.dockerReadLog, 'utf8').trim().split('\n'),
    [
      '/opt/app-root/src/factory-plugins.yaml',
      '/opt/app-root/src/dynamic-plugins.veecode.yaml',
    ],
  );
  const localConfig = fs.readFileSync(
    path.join(
      fixture.runnerRoot,
      'dynamic-plugins-root-dev/dynamic-plugins.local.yaml',
    ),
    'utf8',
  );
  assert.ok(localConfig.includes(faceReference));
  assert.match(localConfig, /disabled: true/);
});

test('forwards auto-detected and explicit embed-package safeguards', () => {
  const dynamicPackageName =
    '@veecode-platform/backstage-plugin-sample-backend-dynamic';
  const faceReference =
    `oci://quay.io/veecode/sample-backend!${flattenPackageName(dynamicPackageName)}`;
  const fixture = createFixture({
    role: 'backend-plugin',
    packageName: '@veecode-platform/backstage-plugin-sample-backend',
    dynamicPackageName,
    exportDirectory:
      'veecode-platform-backstage-plugin-sample-backend-dynamic',
    faceConfig: [
      'plugins:',
      `  - package: ${faceReference}`,
      '    disabled: false',
      '',
    ].join('\n'),
    dependencies: {
      '@veecode-platform/sample-common': 'workspace:^',
    },
    scripts: {
      'export-dynamic':
        'npx @red-hat-developer-hub/cli@1.11.2 plugin export --embed-package @veecode-platform/declared-common',
    },
  });
  const result = fixture.run([
    'plugins/sample',
    '--embed-package',
    '@veecode-platform/explicit-common',
  ]);

  assert.equal(result.status, 0, result.stderr);
  const cliArgs = fs.readFileSync(fixture.cliArgsLog, 'utf8').trim().split('\n');
  assert.deepEqual(cliArgs.slice(0, 4), [
    '--yes',
    '--package=@red-hat-developer-hub/cli@1.11.2',
    'rhdh-cli',
    'plugin',
  ]);
  assert.equal(cliArgs[4], 'export');
  for (const packageName of [
    '@veecode-platform/sample-common',
    '@veecode-platform/declared-common',
    '@veecode-platform/explicit-common',
  ]) {
    assert.ok(
      cliArgs.includes(packageName),
      `CLI args should include ${packageName}`,
    );
  }
});

test('rejects a workspace plugin that was not included in the export command', () => {
  const fixture = createFixture({
    workspaceReference:
      './dynamic-plugins-src/veecode-platform-backstage-plugin-sample',
    additionalReferences: [
      './dynamic-plugins-src/veecode-platform-backstage-plugin-unexported',
    ],
  });
  const unexportedRoot = path.join(
    fixture.workspaceRoot,
    'plugins',
    'unexported',
  );
  fs.mkdirSync(unexportedRoot, { recursive: true });
  fs.writeFileSync(
    path.join(unexportedRoot, 'package.json'),
    JSON.stringify({
      name: '@veecode-platform/backstage-plugin-unexported',
    }),
  );
  const result = fixture.run();

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /references unexported workspace plugins/);
});
