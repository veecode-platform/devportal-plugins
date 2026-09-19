#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SUPPORTED_ROLES = new Set(['frontend-plugin', 'backend-plugin']);

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
    outputRoot: outputRoot ? path.resolve(outputRoot) : path.resolve('workspaces'),
  };
}

function templateValues({ name, role, devportalContextScript }) {
  const pluginPath = role === 'frontend-plugin' ? name : `${name}-backend`;
  const values = {
    name,
    pascalName: pascalCase(name),
    camelName: camelCase(name),
    role,
    plugin_path: pluginPath,
    dynamic_package: `veecode-platform-backstage-plugin-${pluginPath}`,
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
        : `/api/${name}-backend/health responds in devportal-local`,
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

function renderPath(relativePath, values) {
  return render(relativePath, values)
    .replace(/^plugins\/plugin-backend(?=\/|$)/, `plugins/${values.plugin_path}`)
    .replace(/^plugins\/plugin(?=\/|$)/, `plugins/${values.plugin_path}`);
}

function normalizeYarnLock(content) {
  const blocks = content.trimEnd().split(/\n\n/);
  const metadataIndex = blocks.findIndex(block =>
    block.startsWith('__metadata:'),
  );
  if (metadataIndex === -1) return content;

  const prefix = blocks.slice(0, metadataIndex + 1);
  const entries = blocks.slice(metadataIndex + 1).sort((left, right) => {
    const leftHeader = left.split('\n', 1)[0].replace(/":$/, '');
    const rightHeader = right.split('\n', 1)[0].replace(/":$/, '');
    return leftHeader < rightHeader ? -1 : leftHeader > rightHeader ? 1 : 0;
  });

  return `${[...prefix, ...entries].join('\n\n')}\n`;
}

function copyEntry(source, target, values) {
  const stat = fs.lstatSync(source);
  if (stat.isDirectory()) {
    fs.mkdirSync(target, { recursive: true });
    for (const entry of fs.readdirSync(source)) {
      copyEntry(
        path.join(source, entry),
        path.join(target, renderPath(entry, values)),
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
  let renderedContent = isBinary ? content : render(content.toString('utf8'), values);
  if (!isBinary && path.basename(source) === 'yarn.lock') {
    renderedContent = renderedContent
      .replaceAll(
        'workspace:plugins/plugin-backend',
        `workspace:plugins/${values.plugin_path}`,
      )
      .replaceAll(
        'workspace:plugins/plugin',
        `workspace:plugins/${values.plugin_path}`,
      );
    renderedContent = normalizeYarnLock(renderedContent);
  }
  fs.writeFileSync(target, renderedContent, { mode: stat.mode });
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
        path.join(destination, renderPath(relativePath, values)),
        values,
      );
    }

    for (const relativePath of roleEntries) {
      const rolePath = path.join(templateRoot, 'roles', options.role, relativePath);
      copyEntry(
        rolePath,
        path.join(destination, renderPath(relativePath, values)),
        values,
      );
    }

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
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    console.error(
      'Usage: yarn create-workspace <name> --role <frontend-plugin|backend-plugin>',
    );
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  createWorkspace,
  parseArgs,
  templateValues,
  normalizeYarnLock,
};
