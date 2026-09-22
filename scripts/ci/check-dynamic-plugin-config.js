#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const HOST_CONFIG_ROOTS = new Set(['app', 'backend']);
// Packages the portal loads as dynamic plugins. A library ships no pluginConfig
// of its own; its schema is reached through the plugin that depends on it.
const PLUGIN_ROLES = new Set([
  'frontend-plugin',
  'backend-plugin',
  'backend-plugin-module',
]);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function listProductPackages(workspaceRoot) {
  const pluginsRoot = path.join(workspaceRoot, 'plugins');
  if (!fs.existsSync(pluginsRoot)) return [];

  return fs
    .readdirSync(pluginsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const packagePath = path.join(pluginsRoot, entry.name, 'package.json');
      if (!fs.existsSync(packagePath)) return null;
      return {
        directory: entry.name,
        packagePath,
        manifest: readJson(packagePath),
      };
    })
    .filter(Boolean);
}

function packageExportNames(manifest, directory) {
  return [
    manifest.name,
    manifest.backstage?.pluginPackage,
    ...(manifest.backstage?.pluginPackages ?? []),
    directory,
  ].filter((value) => typeof value === 'string' && value.length > 0);
}

function exportBaseName(packageName) {
  return packageName.replace(/^@/, '').replaceAll('/', '-');
}

function packageSpecName(packageSpec) {
  if (typeof packageSpec !== 'string' || packageSpec.startsWith('.')) {
    return null;
  }

  if (packageSpec.startsWith('@')) {
    const slash = packageSpec.indexOf('/');
    const versionSeparator = packageSpec.indexOf('@', slash + 1);
    return versionSeparator === -1
      ? packageSpec
      : packageSpec.slice(0, versionSeparator);
  }

  const versionSeparator = packageSpec.indexOf('@');
  return versionSeparator === -1
    ? packageSpec
    : packageSpec.slice(0, versionSeparator);
}

function packagePathBase(packageSpec) {
  if (typeof packageSpec !== 'string') return null;
  const withoutQuery = packageSpec.split(/[?#]/, 1)[0].replace(/[\\/]$/, '');
  return path.posix.basename(withoutQuery.replaceAll('\\', '/'));
}

function findProductPackage(packageSpec, products) {
  const specName = packageSpecName(packageSpec);
  const base = packagePathBase(packageSpec);
  if (!specName && !base) return null;

  let best;
  let bestScore = -1;
  for (const product of products) {
    for (const name of packageExportNames(
      product.manifest,
      product.directory,
    )) {
      const nameBase = exportBaseName(name);
      let score = -1;
      if (specName === name) score = 100;
      else if (base === nameBase) score = 90;
      else if (base === `${nameBase}-dynamic`) score = 80;

      if (score > bestScore) {
        best = product;
        bestScore = score;
      }
    }
  }

  return bestScore >= 0 ? best : null;
}

function resolvePackageManifest(packageName, fromDirectory) {
  const packageRequire = createRequire(
    path.join(fromDirectory, 'package.json'),
  );
  try {
    return packageRequire.resolve(`${packageName}/package.json`);
  } catch {
    const entryPath = packageRequire.resolve(packageName);
    let directory = path.dirname(entryPath);
    while (
      directory !== path.dirname(directory) &&
      !fs.existsSync(path.join(directory, 'package.json'))
    ) {
      directory = path.dirname(directory);
    }
    const packagePath = path.join(directory, 'package.json');
    if (!fs.existsSync(packagePath)) {
      throw new Error(`Could not find package.json for ${packageName}`);
    }
    return packagePath;
  }
}

function collectSchemaPackagePaths(
  rootPackagePath,
  resolveManifest = resolvePackageManifest,
) {
  const queue = [rootPackagePath];
  const visited = new Set();
  const schemaPackagePaths = [];

  while (queue.length > 0) {
    const packagePath = fs.realpathSync(queue.shift());
    if (visited.has(packagePath)) continue;
    visited.add(packagePath);

    const manifest = readJson(packagePath);
    if (Object.hasOwn(manifest, 'configSchema')) {
      schemaPackagePaths.push(packagePath);
    }

    const runtimeDependencies = [
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.optionalDependencies ?? {}),
    ];
    for (const dependency of runtimeDependencies) {
      try {
        queue.push(resolveManifest(dependency, path.dirname(packagePath)));
      } catch {
        // Match config-loader's behavior: a dependency without a resolvable
        // package.json cannot contribute a schema, so it is not a validation
        // error by itself.
        continue;
      }
    }
  }

  return { schemaPackagePaths };
}

function scopeSchemaToPlugin(schema) {
  const value = structuredClone(schema.value);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...schema, value };
  }

  if (value.properties && typeof value.properties === 'object') {
    for (const root of HOST_CONFIG_ROOTS) {
      delete value.properties[root];
    }
  }
  if (Array.isArray(value.required)) {
    value.required = value.required.filter(
      (property) => !HOST_CONFIG_ROOTS.has(property),
    );
    if (value.required.length === 0) delete value.required;
  }

  return { ...schema, value };
}

function jsonPointerToPath(pointer) {
  if (!pointer) return '';
  return pointer
    .replace(/^\//, '')
    .split('/')
    .filter(Boolean)
    .map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'))
    .join('.');
}

function validationMessages(error) {
  if (Array.isArray(error?.messages) && error.messages.length > 0) {
    return error.messages;
  }
  return [error instanceof Error ? error.message : String(error)];
}

function validationErrors(error, schema, configFile, workspaceRoot) {
  return validationMessages(error).map((message) => {
    const missingProperty = message.match(/missingProperty=([^\s}]+)/)?.[1];
    const pointer = message.match(/ at (.*)$/)?.[1] ?? '';
    const parentPath = jsonPointerToPath(pointer);
    const propertyPath = [parentPath, missingProperty]
      .filter(Boolean)
      .join('.');

    return {
      configFile: path.relative(workspaceRoot, configFile),
      message,
      packageName: schema.packageName,
      propertyPath: propertyPath || '(unknown)',
      schemaFile: path.isAbsolute(schema.path)
        ? path.relative(workspaceRoot, schema.path)
        : schema.path,
    };
  });
}

async function defaultReadDynamicConfig(configFile, fileConfigSource) {
  const source = fileConfigSource.create({ path: configFile, watch: false });
  const result = await source.readConfigData({}).next();
  return result.value?.configs?.[0]?.data ?? {};
}

function workspaceModules(workspaceRoot) {
  const workspaceRequire = createRequire(
    path.join(workspaceRoot, 'package.json'),
  );
  return {
    fileConfigSource: workspaceRequire('@backstage/config-loader')
      .FileConfigSource,
    loadConfigSchema: workspaceRequire('@backstage/config-loader')
      .loadConfigSchema,
  };
}

async function checkWorkspace(workspaceRoot, options = {}) {
  const configFile =
    options.dynamicPluginsFile ??
    path.join(workspaceRoot, 'dynamic-plugins.yaml');
  const hasConfigFile = fs.existsSync(configFile);

  const previousDirectory = process.cwd();
  process.chdir(workspaceRoot);
  try {
    const modules =
      options.modules ??
      (options.readDynamicConfig && options.loadConfigSchema
        ? {}
        : workspaceModules(workspaceRoot));
    const readDynamicConfig =
      options.readDynamicConfig ??
      ((file) => defaultReadDynamicConfig(file, modules.fileConfigSource));
    const loadConfigSchema =
      options.loadConfigSchema ?? modules.loadConfigSchema;
    const resolveManifest =
      options.resolvePackageManifest ?? resolvePackageManifest;
    const products = options.products ?? listProductPackages(workspaceRoot);
    // A missing file or entry is validated as an empty pluginConfig, not
    // skipped: shipping no config at all is how aws-cost-insights took the
    // portal down (#165).
    const dynamicConfig = hasConfigFile
      ? await readDynamicConfig(configFile)
      : {};
    const entries = Array.isArray(dynamicConfig.plugins)
      ? dynamicConfig.plugins
      : [];
    const errors = [];
    const unavailable = [];
    const targets = [];
    const covered = new Set();

    for (const entry of entries) {
      if (entry?.disabled === true) continue;

      const product = findProductPackage(entry?.package, products);
      if (!product) {
        if (!entry?.pluginConfig) continue;
        errors.push({
          configFile: path.relative(workspaceRoot, configFile),
          message: `Could not map dynamic plugin package ${entry.package} to a product package`,
          packageName: entry.package,
          propertyPath: 'pluginConfig',
          schemaFile: '(package mapping)',
        });
        continue;
      }
      covered.add(product);
      targets.push({ product, pluginConfig: entry.pluginConfig ?? {} });
    }

    for (const product of products) {
      if (covered.has(product) || product.manifest.private === true) continue;
      if (!PLUGIN_ROLES.has(product.manifest.backstage?.role)) continue;
      targets.push({ product, pluginConfig: {} });
    }

    for (const { product, pluginConfig } of targets) {
      let rootPackagePath;
      try {
        rootPackagePath = resolveManifest(
          product.manifest.name,
          path.dirname(product.packagePath),
        );
      } catch (error) {
        errors.push({
          configFile: path.relative(workspaceRoot, configFile),
          message: `Could not resolve ${product.manifest.name}: ${
            error instanceof Error ? error.message : String(error)
          }`,
          packageName: product.manifest.name,
          propertyPath: 'pluginConfig',
          schemaFile: product.packagePath,
        });
        continue;
      }

      const collected = collectSchemaPackagePaths(
        rootPackagePath,
        resolveManifest,
      );
      for (const schemaPackagePath of collected.schemaPackagePaths) {
        let loadedSchema;
        try {
          loadedSchema = await loadConfigSchema({
            dependencies: [],
            excludePackageDependencies: true,
            packagePaths: [schemaPackagePath],
          });
        } catch (error) {
          // A schema that does not compile here (e.g. a published config.d.ts
          // importing sources the package does not ship) is a limit of this
          // check, not a config defect: report it, as upstream's validator
          // reports `unavailable`, without failing the workspace.
          unavailable.push({
            message: error instanceof Error ? error.message : String(error),
            packageName: readJson(schemaPackagePath).name,
          });
          continue;
        }

        const serialized = loadedSchema.serialize();
        for (const schema of serialized.schemas ?? []) {
          const scopedSchema = scopeSchemaToPlugin(schema);
          const schemaForPlugin = await loadConfigSchema({
            serialized: {
              ...serialized,
              schemas: [scopedSchema],
            },
          });

          try {
            schemaForPlugin.process([{ data: pluginConfig }]);
          } catch (error) {
            errors.push(
              ...validationErrors(
                error,
                scopedSchema,
                configFile,
                workspaceRoot,
              ),
            );
          }
        }
      }
    }

    return {
      checked: targets.length,
      errors,
      unavailable,
      skipped: targets.length === 0,
    };
  } finally {
    process.chdir(previousDirectory);
  }
}

function formatError(error) {
  return `${error.packageName}: missing/invalid ${error.propertyPath}; schema ${error.schemaFile}; declare it in ${error.configFile}`;
}

async function main() {
  if (process.argv.length < 3) {
    throw new Error(
      'Usage: node check-dynamic-plugin-config.js name-of-the-workspace',
    );
  }

  const repoRoot = path.resolve(__dirname, '..', '..');
  const workspace = process.argv[2];
  const workspaceRoot = path.join(repoRoot, 'workspaces', workspace);
  const result = await checkWorkspace(workspaceRoot);

  if (result.skipped) {
    console.log(`${workspace}: SKIP (no published dynamic plugin package)`);
    return;
  }

  for (const error of result.errors) {
    console.error(`${workspace}: ${formatError(error)}`);
  }
  for (const note of result.unavailable) {
    console.log(
      `${workspace}: NOTE schema unavailable for ${note.packageName}: ${note.message.split('\n')[0]}`,
    );
  }
  console.log(
    `${workspace}: ${result.errors.length > 0 ? 'FAIL' : 'PASS'} (${
      result.checked
    } plugin packages, ${result.errors.length} errors, ${
      result.unavailable.length
    } schemas unavailable)`,
  );
  if (result.errors.length > 0) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
  });
}

module.exports = {
  checkWorkspace,
  collectSchemaPackagePaths,
  findProductPackage,
  scopeSchemaToPlugin,
};
