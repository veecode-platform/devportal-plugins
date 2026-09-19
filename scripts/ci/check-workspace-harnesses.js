#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REQUIRED_SECTIONS = [
  'Commands',
  'Layout',
  'Architecture',
  'How to test',
  'Pull requests and changesets',
];

function productPackages(workspaceRoot) {
  const pluginsRoot = path.join(workspaceRoot, 'plugins');
  if (!fs.existsSync(pluginsRoot)) return [];

  return fs
    .readdirSync(pluginsRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => path.join(pluginsRoot, entry.name, 'package.json'))
    .filter(fs.existsSync)
    .map(file => {
      try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
      } catch (error) {
        return { __error: `${path.relative(workspaceRoot, file)} is invalid JSON` };
      }
    });
}

function inspectWorkspace(workspaceRoot) {
  const issues = [];
  const agentsPath = path.join(workspaceRoot, 'AGENTS.md');

  if (!fs.existsSync(agentsPath)) {
    issues.push('AGENTS.md is missing');
  }

  const agents = fs.existsSync(agentsPath) ? fs.readFileSync(agentsPath, 'utf8') : '';
  for (const section of REQUIRED_SECTIONS) {
    if (!agents.includes(`## ${section}`)) {
      issues.push(`AGENTS.md is missing section: ${section}`);
    }
  }

  const packages = productPackages(workspaceRoot);
  if (packages.length === 0) {
    issues.push('at least one plugin package is required');
  }

  const roles = new Set();
  const pluginPackages = [];
  for (const pkg of packages) {
    if (pkg.__error) {
      issues.push(pkg.__error);
      continue;
    }
    if (pkg.backstage?.role) roles.add(pkg.backstage.role);
    if (pkg.backstage?.role && pkg.backstage.role !== 'backend') {
      pluginPackages.push(pkg);
    }
  }

  if (roles.has('frontend-plugin')) {
    if (!fs.existsSync(path.join(workspaceRoot, 'packages', 'app'))) {
      issues.push('frontend-plugin requires packages/app');
    }
    const isTheme = pluginPackages.some(pkg =>
      String(pkg.backstage?.pluginId ?? '').toLowerCase().includes('theme'),
    );
    if (!isTheme && !fs.existsSync(path.join(workspaceRoot, 'playwright.config.ts'))) {
      issues.push('frontend-plugin requires playwright.config.ts');
    }
    const hasPlaywrightTests =
      fs.existsSync(path.join(workspaceRoot, 'e2e-tests')) ||
      fs.existsSync(path.join(workspaceRoot, 'packages', 'app', 'e2e-tests'));
    if (!isTheme && !hasPlaywrightTests) {
      issues.push('frontend-plugin requires e2e-tests/');
    }
  }
  if (
    (roles.has('backend-plugin') || roles.has('backend-plugin-module')) &&
    !fs.existsSync(path.join(workspaceRoot, 'packages', 'backend'))
  ) {
    const role = roles.has('backend-plugin') ? 'backend-plugin' : 'backend-plugin-module';
    issues.push(`${role} requires packages/backend`);
  }

  const hasCatalogModule = pluginPackages.some(
    pkg =>
      pkg.backstage?.role === 'backend-plugin-module' &&
      pkg.backstage?.pluginId === 'catalog',
  );
  if (hasCatalogModule) {
    const fixturesRoot = path.join(workspaceRoot, 'fixtures');
    const hasFixture = fs.existsSync(fixturesRoot) &&
      fs.readdirSync(fixturesRoot).some(entry => /\.ya?ml$/i.test(entry));
    if (!hasFixture) {
      issues.push('backend-plugin-module catalog requires a YAML fixture in fixtures/');
    }
  }

  return issues;
}

function listProductWorkspaces(workspacesRoot) {
  return fs
    .readdirSync(workspacesRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .filter(entry => entry.name !== 'dummy')
    .filter(entry => !fs.existsSync(path.join(workspacesRoot, entry.name, 'template.json')))
    .filter(entry => fs.existsSync(path.join(workspacesRoot, entry.name, 'package.json')))
    .map(entry => entry.name)
    .sort();
}

function main() {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const workspacesRoot = path.join(repoRoot, 'workspaces');
  let failed = false;

  for (const workspace of listProductWorkspaces(workspacesRoot)) {
    const issues = inspectWorkspace(path.join(workspacesRoot, workspace));
    if (issues.length > 0) {
      failed = true;
      for (const issue of issues) console.error(`${workspace}: ${issue}`);
    } else {
      console.log(`${workspace}: OK`);
    }
  }

  if (failed) process.exitCode = 1;
}

if (require.main === module) main();

module.exports = {
  inspectWorkspace,
  listProductWorkspaces,
};
