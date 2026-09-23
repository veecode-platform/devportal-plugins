#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// Both rules ship enabled in Backstage's recommended ESLint config. Undeclared
// imports catch dependencies that only resolve through hoisting; relative
// monorepo imports catch paths that reach into packages/.
const RULE_IDS = new Set([
  '@backstage/no-undeclared-imports',
  '@backstage/no-relative-monorepo-imports',
]);
// no-undeclared-imports skips a package Node cannot resolve, and a dev shell
// app never resolves, so imports of dev shell packages by name are restricted
// explicitly. The marker tells those findings apart from the rule's defaults.
const DEV_SHELL_IMPORT = 'imports a dev shell package from packages/';
const SOURCE_EXTENSIONS = new Set([
  '.cjs', '.cts', '.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx',
]);
const IGNORED_DIRECTORIES = new Set([
  '.git', '.yarn', 'build', 'coverage', 'dist', 'node_modules',
]);

function relativePath(root, file) {
  return path.relative(root, file).split(path.sep).join('/');
}

function isWithin(directory, candidate) {
  const relative = path.relative(directory, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function pluginDirectories(workspaceRoot) {
  const pluginsRoot = path.join(workspaceRoot, 'plugins');
  if (!fs.existsSync(pluginsRoot)) return [];

  return fs.readdirSync(pluginsRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => path.join(pluginsRoot, entry.name))
    .filter(directory => fs.existsSync(path.join(directory, 'package.json')))
    .sort();
}

function devShellPackageLocations(workspaceRoot) {
  const packagesRoot = path.join(workspaceRoot, 'packages');
  const locations = new Map();
  if (!fs.existsSync(packagesRoot)) return locations;

  for (const entry of fs.readdirSync(packagesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(packagesRoot, entry.name, 'package.json');
    if (!fs.existsSync(manifestPath)) continue;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (typeof manifest.name === 'string') {
      locations.set(manifest.name, path.join('packages', entry.name));
    }
  }

  return locations;
}

function lineAt(source, offset) {
  return source.slice(0, offset).split(/\r?\n/).length;
}

function jsonStringLine(source, value, propertyName) {
  const propertyOffset = source.indexOf(`"${propertyName}"`);
  const searchFrom = propertyOffset === -1 ? 0 : propertyOffset;
  const valueOffset = source.indexOf(JSON.stringify(value), searchFrom);
  return valueOffset === -1 ? 1 : lineAt(source, valueOffset);
}

function exposedModuleValues(value) {
  if (typeof value === 'string') return [value];
  if (!value || typeof value !== 'object') return [];
  return Object.values(value).flatMap(exposedModuleValues);
}

function scanWorkspace(workspaceRoot) {
  const packagesRoot = path.resolve(workspaceRoot, 'packages');
  const devShellPackages = devShellPackageLocations(workspaceRoot);
  const findings = [];

  for (const pluginRoot of pluginDirectories(workspaceRoot)) {
    const manifestPath = path.join(pluginRoot, 'package.json');
    const manifestContents = fs.readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestContents);
    const metadataFile = relativePath(workspaceRoot, manifestPath);

    for (const name of manifest.backstage?.pluginPackages ?? []) {
      const location = devShellPackages.get(name);
      if (location) {
        findings.push({
          file: metadataFile,
          line: jsonStringLine(manifestContents, name, 'pluginPackages'),
          message: `backstage.pluginPackages references dev shell package ${name} (${location})`,
        });
      }
    }

    for (const value of exposedModuleValues(manifest.scalprum?.exposedModules)) {
      const target = path.resolve(pluginRoot, value);
      const devShellName = [...devShellPackages.keys()].find(name =>
        value === name || value.startsWith(`${name}/`),
      );
      if (isWithin(packagesRoot, target)) {
        const directory = relativePath(workspaceRoot, target).split('/')[1];
        findings.push({
          file: metadataFile,
          line: jsonStringLine(manifestContents, value, 'exposedModules'),
          message: `scalprum.exposedModules resolves into packages/${directory}`,
        });
      } else if (devShellName) {
        findings.push({
          file: metadataFile,
          line: jsonStringLine(manifestContents, value, 'exposedModules'),
          message: `scalprum.exposedModules references dev shell package ${devShellName}`,
        });
      }
    }

    for (const value of manifest.files ?? []) {
      if (typeof value !== 'string') continue;
      const target = path.resolve(pluginRoot, value);
      if (isWithin(packagesRoot, target)) {
        const directory = relativePath(workspaceRoot, target).split('/')[1];
        findings.push({
          file: metadataFile,
          line: jsonStringLine(manifestContents, value, 'files'),
          message: `files entry resolves into packages/${directory}`,
        });
      }
    }
  }

  return findings.sort((left, right) =>
    left.file.localeCompare(right.file) || left.line - right.line || left.message.localeCompare(right.message),
  );
}

function sourceFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry.name)) files.push(...sourceFiles(filePath));
    } else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(filePath);
    }
  }
  return files.sort();
}

function extractLintFindings(jsonOutput, workspaceRoot) {
  const output = jsonOutput.trim();
  let results;
  try {
    results = JSON.parse(output);
  } catch {
    const end = output.lastIndexOf(']');
    for (let start = output.indexOf('['); start !== -1 && start < end; start = output.indexOf('[', start + 1)) {
      try {
        const parsed = JSON.parse(output.slice(start, end + 1));
        if (Array.isArray(parsed)) {
          results = parsed;
          break;
        }
      } catch {
        // Keep searching: Backstage CLI may prefix the formatter output with a notice.
      }
    }
    if (!results) throw new Error('ESLint JSON array was not found in the command output');
  }

  return results.flatMap(result => result.messages
    .filter(message => RULE_IDS.has(message.ruleId) || (
      message.ruleId === 'no-restricted-imports' && message.message.includes(DEV_SHELL_IMPORT)
    ))
    .map(message => ({
      file: relativePath(workspaceRoot, result.filePath),
      line: message.line ?? 1,
      rule: message.ruleId,
      message: message.message,
    })))
    .sort((left, right) =>
      left.file.localeCompare(right.file) || left.line - right.line || left.message.localeCompare(right.message),
    );
}

function runLint(workspaceRoot) {
  const plugins = pluginDirectories(workspaceRoot);
  if (plugins.length === 0) return [];

  const eslintFactoryPath = require.resolve('@backstage/cli/config/eslint-factory', {
    paths: [workspaceRoot],
  });
  const eslintPackagePath = require.resolve('eslint/package.json', {
    paths: [workspaceRoot],
  });
  const eslintBin = path.join(path.dirname(eslintPackagePath), 'bin', 'eslint.js');
  const tempConfigParent = path.join(workspaceRoot, 'node_modules', '.cache');
  fs.mkdirSync(tempConfigParent, { recursive: true });
  const tempConfigRoot = fs.mkdtempSync(path.join(tempConfigParent, 'product-independence-'));
  const devShellNames = [...devShellPackageLocations(workspaceRoot).keys()];
  // Passed on the command line: the config file sits outside the package, so
  // the factory's test-file override would otherwise match every file and
  // replace this rule.
  const devShellRule = devShellNames.length === 0 ? [] : ['--rule', JSON.stringify({
    'no-restricted-imports': [2, {
      patterns: [{ group: devShellNames.map(name => `/${name}`), message: DEV_SHELL_IMPORT }],
    }],
  })];

  const findings = [];
  try {
    for (const [index, pluginRoot] of plugins.entries()) {
      // Product code is what the package builds from; dev/, migrations/ and
      // similar folders are outside it and may carry no ESLint config.
      const sourceRoot = path.join(pluginRoot, 'src');
      const sourcePaths = sourceFiles(pluginRoot).filter(file =>
        !fs.existsSync(sourceRoot) || isWithin(sourceRoot, file),
      );
      if (sourcePaths.length === 0) continue;

      const configPath = path.join(tempConfigRoot, `eslint-${index}.cjs`);
      fs.writeFileSync(
        configPath,
        `module.exports = require(${JSON.stringify(eslintFactoryPath)})(${JSON.stringify(pluginRoot)});\n`,
      );
      const result = spawnSync(process.execPath, [
        eslintBin,
        '--no-eslintrc',
        '--config', configPath,
        ...devShellRule,
        '--format', 'json',
        '--ext', [...SOURCE_EXTENSIONS].join(','),
        ...sourcePaths.map(file => relativePath(workspaceRoot, file)),
      ], {
        cwd: workspaceRoot,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      });

      if (result.error) throw result.error;
      if (result.status !== 0 && !result.stdout?.trim()) {
        throw new Error(`ESLint exited with status ${result.status}: ${result.stderr?.trim() || 'no output'}`);
      }
      try {
        findings.push(...extractLintFindings(result.stdout || '[]', workspaceRoot));
      } catch (error) {
        const detail = result.stderr?.trim() || result.stdout?.trim() || error.message;
        throw new Error(`Unable to read ESLint JSON output: ${detail}`);
      }
    }
  } finally {
    fs.rmSync(tempConfigRoot, { recursive: true, force: true });
  }

  return findings;
}

function main() {
  const workspaceRoot = process.cwd();
  const workspace = path.basename(workspaceRoot);
  const lintFindings = runLint(workspaceRoot);
  const staticFindings = scanWorkspace(workspaceRoot);

  for (const finding of lintFindings) {
    console.error(`${finding.rule}: ${finding.file}:${finding.line} ${finding.message}`);
  }
  for (const finding of staticFindings) {
    console.error(`package metadata: ${finding.file}:${finding.line} ${finding.message}`);
  }

  console.log(`${workspace}: imports=${lintFindings.length}, metadata=${staticFindings.length}`);
  if (lintFindings.length > 0 || staticFindings.length > 0) process.exitCode = 1;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}

module.exports = {
  extractLintFindings,
  scanWorkspace,
};
