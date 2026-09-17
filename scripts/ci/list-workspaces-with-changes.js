#!/usr/bin/env node
'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');
const baseRef = process.argv[2] || process.env.BASE_REF || 'origin/main';
const headRef = process.argv[3] || process.env.HEAD_REF || 'HEAD';
const workspacesRoot = path.join(repoRoot, 'workspaces');

function listWorkspaces() {
  return fs
    .readdirSync(workspacesRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .filter(entry => fs.existsSync(path.join(workspacesRoot, entry.name, 'package.json')))
    .map(entry => entry.name)
    .sort();
}

function changedFiles() {
  const output = execFileSync(
    'git',
    ['diff', '--name-only', '--no-renames', `${baseRef}...${headRef}`],
    { cwd: repoRoot, encoding: 'utf8' },
  );

  return output.split(/\r?\n/).filter(Boolean);
}

function main() {
  const files = changedFiles();
  const allWorkspaces = listWorkspaces();
  const selectsAll = files.some(
    file => file === '.github/workflows/ci.yml' || file.startsWith('scripts/ci/'),
  );

  const workspaceNames = selectsAll
    ? allWorkspaces
    : [...new Set(
        files
          .map(file => file.match(/^workspaces\/([^/]+)(?:\/|$)/)?.[1])
          .filter(name => name && allWorkspaces.includes(name)),
      )].sort();

  const serializedWorkspaces = JSON.stringify(workspaceNames);
  process.stdout.write(`${serializedWorkspaces}\n`);

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `workspaces=${serializedWorkspaces}\n`);
  }
}

try {
  process.chdir(repoRoot);
  main();
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
}
