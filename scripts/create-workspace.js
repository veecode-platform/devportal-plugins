#!/usr/bin/env node
'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const SUPPORTED_ROLES = new Set(['frontend-plugin', 'backend-plugin']);
const PACKAGE_SCOPE = 'veecode-platform';
const RHDH_CLI = '@red-hat-developer-hub/cli@2.0.0';

function pascalCase(value) {
  return value
    .split('-')
    .filter(Boolean)
    .map(part => part[0].toUpperCase() + part.slice(1))
    .join('');
}

function camelCase(value) {
  const pascal = pascalCase(value);
  return pascal[0].toLowerCase() + pascal.slice(1);
}

function parseArgs(argv) {
  const [name, ...rest] = argv;
  let role;
  let outputRoot;
  let shellOnly = false;

  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (argument === '--role') {
      const value = rest[++index];
      if (!value || value.startsWith('--')) {
        throw new Error('--role requires a value');
      }
      role = value;
    } else if (argument === '--output-root') {
      const value = rest[++index];
      if (!value || value.startsWith('--')) {
        throw new Error('--output-root requires a value');
      }
      outputRoot = value;
    } else if (argument === '--shell-only') {
      shellOnly = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (!name || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(name)) {
    throw new Error(
      'Workspace name must be lowercase kebab-case and start with a letter',
    );
  }
  if (!role || !SUPPORTED_ROLES.has(role)) {
    throw new Error(
      `Unsupported role: ${role || '(missing)'}. Supported roles: ${[
        ...SUPPORTED_ROLES,
      ].join(', ')}`,
    );
  }

  return {
    name,
    role,
    shellOnly,
    outputRoot: outputRoot ? path.resolve(outputRoot) : path.resolve('workspaces'),
  };
}

// `backstage-cli new` derives the package directory from the plugin id: a
// backend plugin lands in plugins/<id>-backend, a frontend one in plugins/<id>.
// The plugin id itself is the workspace name for both, so a backend's API
// mounts at /api/<name>, as upstream plugins do.
function pluginPathFor(name, role) {
  return role === 'frontend-plugin' ? name : `${name}-backend`;
}

function templateValues({ name, role, devportalContextScript }) {
  const pluginPath = pluginPathFor(name, role);
  const values = {
    name,
    pascalName: pascalCase(name),
    camelName: camelCase(name),
    role,
    plugin_path: pluginPath,
    dynamic_package: `${PACKAGE_SCOPE}-backstage-plugin-${pluginPath}`,
    primary_command: role === 'frontend-plugin' ? 'start' : 'start',
    harness_layout:
      role === 'frontend-plugin'
        ? 'packages/app plus Playwright'
        : 'packages/backend plus backend unit tests',
    proof1:
      role === 'frontend-plugin'
        ? 'yarn test:all and the Playwright suite'
        : 'yarn test:all and the backend health test',
    proof2:
      role === 'frontend-plugin'
        ? 'the exported route renders in devportal-local'
        : `/api/${name}/health responds in devportal-local`,
    harness_commands:
      role === 'frontend-plugin'
        ? '- `yarn test:e2e` — run the Playwright harness. Set `PLAYWRIGHT_URL` when the\n' +
          '  portal is already running (for example, in `devportal-local`).\n' +
          '- `yarn dev:dynamic` — export the product and its dynamic-plugin configuration into\n' +
          '  the `devportal-local` proof runner; follow the complete Compose command it prints.'
        : '- `yarn dev:dynamic` — export the product and its dynamic-plugin configuration into\n' +
          '  the `devportal-local` proof runner; follow the complete Compose command it prints.\n' +
          `- After it is running, \`curl\` /api/${name}/health in devportal-local. The route is\n` +
          '  declared `unauthenticated`, so no token is needed.',
    template_source: 'the repository workspace template',
    devportal_context_script:
      devportalContextScript ??
      '../../.agents/skills/devportal-context/scripts/export-dev-dynamic.sh',
  };

  return values;
}

function render(value, values) {
  return value.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (match, key) => {
    if (!(key in values)) {
      throw new Error(`Unknown template token: ${match}`);
    }
    return values[key];
  });
}

function copyEntry(source, target, values) {
  const stat = fs.lstatSync(source);
  if (stat.isDirectory()) {
    fs.mkdirSync(target, { recursive: true });
    for (const entry of fs.readdirSync(source)) {
      copyEntry(
        path.join(source, entry),
        path.join(target, render(entry, values)),
        values,
      );
    }
    return;
  }
  if (!stat.isFile()) {
    throw new Error(`Unsupported template entry: ${source}`);
  }

  const content = fs.readFileSync(source);
  const isBinary = content.includes(0);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const renderedContent = isBinary ? content : render(content.toString('utf8'), values);
  fs.writeFileSync(target, renderedContent, { mode: stat.mode });
}

// What the export overlay and the dynamic export need on top of what
// `backstage-cli new` writes. Everything else in the manifest is upstream's.
function graftProductManifest(manifest, { role, packageName }) {
  const grafted = { ...manifest };
  grafted.private = true;
  grafted.backstage = {
    ...manifest.backstage,
    pluginPackages: [packageName],
  };
  grafted.scripts = {
    ...manifest.scripts,
    'export-dynamic': `npx ${RHDH_CLI} plugin export`,
  };
  if (role === 'frontend-plugin') {
    grafted.scalprum = {
      name: `${PACKAGE_SCOPE}.${packageName.split('/')[1]}`,
      exposedModules: { PluginRoot: './src/index.ts' },
    };
  }
  return grafted;
}

// The health route is what proof 2 probes, with plain curl and no token, so it
// is declared unauthenticated the way orchestrator and bulk-import do upstream.
function addHealthPolicy(pluginSource) {
  const anchor = /((?:^|\n)(\s*)httpRouter\.use\([\s\S]*?\);\n)/;
  if (!anchor.test(pluginSource)) {
    throw new Error(
      'Could not find `httpRouter.use(...)` in the generated plugin.ts; the backstage-cli template changed shape',
    );
  }
  return pluginSource.replace(
    anchor,
    (match, block, indent) =>
      `${block}${indent}httpRouter.addAuthPolicy({\n${indent}  path: '/health',\n${indent}  allow: 'unauthenticated',\n${indent}});\n`,
  );
}

function addHealthRoute(routerSource) {
  const anchor = /((?:^|\n)(\s*)const router = Router\(\);\n)/;
  if (!anchor.test(routerSource)) {
    throw new Error(
      'Could not find `const router = Router();` in the generated router.ts; the backstage-cli template changed shape',
    );
  }
  return routerSource.replace(
    anchor,
    (match, line, indent) =>
      `${line}${indent}router.get('/health', (_req, res) => {\n${indent}  res.json({ status: 'ok' });\n${indent}});\n`,
  );
}

function healthTestSource({ name, camelName }) {
  return `import { startTestBackend } from '@backstage/backend-test-utils';
import request from 'supertest';
import { ${camelName}Plugin } from './plugin';

describe('${name} health', () => {
  it('answers without credentials', async () => {
    const { server } = await startTestBackend({
      features: [${camelName}Plugin],
    });

    const response = await request(server).get('/api/${name}/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
`;
}

function runYarn(cwd, args) {
  execFileSync('yarn', args, { cwd, stdio: 'inherit' });
}

// `backstage-cli new` names its templates after the frontend system the dev
// shell uses. Our shell is on `@backstage/app-defaults`, so the CLI offers the
// legacy frontend template, which is also what the RHDH dynamic export loads.
// Older CLI lines called that template plainly `frontend-plugin`.
function templateCandidatesFor(role) {
  return role === 'frontend-plugin'
    ? ['frontend-plugin-legacy', 'frontend-plugin']
    : ['backend-plugin'];
}

function runBackstageNew(cwd, role, name) {
  const candidates = templateCandidatesFor(role);
  let lastError;
  for (const template of candidates) {
    try {
      execFileSync(
        'yarn',
        [
          'backstage-cli',
          'new',
          '--select',
          template,
          '--option',
          `pluginId=${name}`,
          '--scope',
          PACKAGE_SCOPE,
          '--skip-install',
        ],
        { cwd, stdio: ['inherit', 'inherit', 'pipe'], encoding: 'utf8' },
      );
      return template;
    } catch (error) {
      const stderr = String(error.stderr ?? '');
      process.stderr.write(stderr);
      lastError = error;
      if (!/Template '.*' not found/.test(stderr)) break;
    }
  }
  throw new Error(
    `backstage-cli new failed for role ${role} (tried ${candidates.join(', ')}): ${lastError?.message}`,
  );
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

// Phase 2: the product package comes from `backstage-cli new` (ADR-0012 §3),
// pinned to the host line by `versions:bump` (ADR-0004), then grafted with what
// the dynamic export needs. Requires network; `--shell-only` skips it.
function createProductPackage(destination, values) {
  const { name, role } = values;
  const pluginPath = values.plugin_path;
  const packageName = `@${PACKAGE_SCOPE}/backstage-plugin-${pluginPath}`;
  const hostVersion = readJson(path.join(destination, 'backstage.json')).version;

  runYarn(destination, ['install']);
  runBackstageNew(destination, role, name);

  const packageDir = path.join(destination, 'plugins', pluginPath);
  const manifestPath = path.join(packageDir, 'package.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(
      `backstage-cli new did not create ${path.relative(destination, manifestPath)}`,
    );
  }
  const manifest = readJson(manifestPath);
  if (manifest.name !== packageName) {
    throw new Error(
      `backstage-cli new named the package ${manifest.name}; expected ${packageName}`,
    );
  }
  writeJson(manifestPath, graftProductManifest(manifest, { role, packageName }));

  if (role === 'backend-plugin') {
    const pluginFile = path.join(packageDir, 'src', 'plugin.ts');
    const routerFile = path.join(packageDir, 'src', 'router.ts');
    fs.writeFileSync(pluginFile, addHealthPolicy(fs.readFileSync(pluginFile, 'utf8')));
    fs.writeFileSync(routerFile, addHealthRoute(fs.readFileSync(routerFile, 'utf8')));
    fs.writeFileSync(
      path.join(packageDir, 'src', 'health.test.ts'),
      healthTestSource(values),
    );
    const backendIndex = fs.readFileSync(
      path.join(destination, 'packages', 'backend', 'src', 'index.ts'),
      'utf8',
    );
    if (!backendIndex.includes(`backend.add(import('${packageName}'));`)) {
      throw new Error('backstage-cli new did not wire the plugin into packages/backend');
    }
  } else {
    const app = fs.readFileSync(
      path.join(destination, 'packages', 'app', 'src', 'App.tsx'),
      'utf8',
    );
    if (!app.includes(`path="/${name}"`)) {
      throw new Error('backstage-cli new did not wire the plugin into packages/app');
    }
  }

  runYarn(destination, ['install']);
  runYarn(destination, ['backstage-cli', 'versions:bump', '--release', hostVersion]);
  runYarn(destination, ['dedupe']);
  runYarn(destination, ['prettier', '--write', '.']);
}

function createWorkspace(options) {
  const repoRoot = path.resolve(__dirname, '..');
  const templateRoot = path.join(repoRoot, 'workspaces', 'dummy-template');
  const manifestPath = path.join(templateRoot, 'template.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const roleEntries = manifest.roles[options.role];

  if (!Array.isArray(roleEntries)) {
    throw new Error(`Template has no entry list for role: ${options.role}`);
  }

  const destination = path.join(options.outputRoot, options.name);
  const helperPath = path.join(
    repoRoot,
    '.agents/skills/devportal-context/scripts/export-dev-dynamic.sh',
  );
  const devportalContextScript = path
    .relative(destination, helperPath)
    .split(path.sep)
    .join('/');
  const values = templateValues({
    ...options,
    devportalContextScript,
  });
  fs.mkdirSync(options.outputRoot, { recursive: true });
  try {
    fs.mkdirSync(destination);
  } catch (error) {
    if (error && error.code === 'EEXIST') {
      throw new Error(`Workspace already exists: ${destination}`);
    }
    throw error;
  }

  try {
    for (const relativePath of manifest.common) {
      copyEntry(
        path.join(templateRoot, relativePath),
        path.join(destination, render(relativePath, values)),
        values,
      );
    }

    for (const relativePath of roleEntries) {
      const rolePath = path.join(templateRoot, 'roles', options.role, relativePath);
      copyEntry(
        rolePath,
        path.join(destination, render(relativePath, values)),
        values,
      );
    }

    // An empty lockfile marks the workspace as its own Yarn project. Without it
    // Yarn walks up to the repository root package.json and refuses to install.
    fs.writeFileSync(path.join(destination, 'yarn.lock'), '');

    const generatedFiles = [];
    const visit = current => {
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const entryPath = path.join(current, entry.name);
        if (entry.isDirectory()) visit(entryPath);
        else generatedFiles.push(entryPath);
      }
    };
    visit(destination);
    for (const filePath of generatedFiles) {
      const content = fs.readFileSync(filePath);
      if (!content.includes(0) && /\{\{[^}]+\}\}/.test(content.toString('utf8'))) {
        throw new Error(`Unrendered template token remains in ${filePath}`);
      }
    }

    if (!options.shellOnly) {
      createProductPackage(destination, values);
    }
  } catch (error) {
    fs.rmSync(destination, { recursive: true, force: true });
    throw error;
  }

  return destination;
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const destination = createWorkspace(options);
    console.log(`Created ${path.relative(process.cwd(), destination)}`);
    if (options.shellOnly) {
      console.log(
        'Shell only: run `yarn install && yarn new` inside the workspace to add the product package.',
      );
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    console.error(
      'Usage: yarn create-workspace <name> --role <frontend-plugin|backend-plugin> [--shell-only]',
    );
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  createWorkspace,
  parseArgs,
  templateValues,
  graftProductManifest,
  templateCandidatesFor,
  addHealthPolicy,
  addHealthRoute,
  healthTestSource,
};
