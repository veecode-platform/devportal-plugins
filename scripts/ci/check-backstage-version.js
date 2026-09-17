#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const HOST_URL =
  'https://raw.githubusercontent.com/veecode-platform/devportal-core/main/backstage.json';
const repoRoot = path.resolve(__dirname, '..', '..');
const workspacesRoot = path.join(repoRoot, 'workspaces');
const strict = process.argv.includes('--strict');

function parseVersion(value) {
  const match = String(value ?? '')
    .trim()
    .match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/);

  if (!match) {
    return null;
  }

  return {
    numbers: match.slice(1, 4).map(Number),
    prerelease: match[4] || null,
  };
}

function compareVersions(left, right) {
  const leftVersion = parseVersion(left);
  const rightVersion = parseVersion(right);

  if (!leftVersion || !rightVersion) {
    return null;
  }

  for (let index = 0; index < leftVersion.numbers.length; index += 1) {
    if (leftVersion.numbers[index] !== rightVersion.numbers[index]) {
      return leftVersion.numbers[index] > rightVersion.numbers[index] ? 1 : -1;
    }
  }

  if (leftVersion.prerelease === rightVersion.prerelease) {
    return 0;
  }

  return leftVersion.prerelease ? -1 : 1;
}

function workspaceVersions() {
  return fs
    .readdirSync(workspacesRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => {
      const workspace = entry.name;
      const file = path.join(workspacesRoot, workspace, 'backstage.json');

      if (!fs.existsSync(file)) {
        return null;
      }

      try {
        const document = JSON.parse(fs.readFileSync(file, 'utf8'));
        return { workspace, version: document.version || null };
      } catch (error) {
        console.error(
          `Could not read ${path.relative(repoRoot, file)}: ${
            error instanceof Error ? error.message : error
          }`,
        );
        return { workspace, version: null };
      }
    })
    .filter(Boolean)
    .sort((left, right) => left.workspace.localeCompare(right.workspace));
}

async function fetchHostVersion() {
  const override = process.env.HOST_BACKSTAGE_VERSION?.trim();
  if (override) {
    return override;
  }

  try {
    const response = await fetch(HOST_URL);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const document = await response.json();
    return document.version || null;
  } catch (error) {
    console.error(
      `Could not fetch host Backstage version from ${HOST_URL}: ${
        error instanceof Error ? error.message : error
      }`,
    );
    return null;
  }
}

function statusFor(workspaceVersion, hostVersion) {
  if (!workspaceVersion || !hostVersion) {
    return 'missing';
  }

  const comparison = compareVersions(workspaceVersion, hostVersion);
  if (comparison === null) {
    return 'missing';
  }

  if (comparison === 0) {
    return 'ok';
  }

  return comparison < 0 ? 'behind' : 'ahead';
}

function renderTable(rows) {
  return [
    '| Workspace | Version | Host | Status |',
    '| --- | --- | --- | --- |',
    ...rows.map(row =>
      `| ${row.workspace} | ${row.version || 'missing'} | ${row.host || 'missing'} | ${row.status} |`,
    ),
  ].join('\n');
}

async function main() {
  const hostVersion = await fetchHostVersion();
  const rows = workspaceVersions().map(({ workspace, version }) => ({
    workspace,
    version,
    host: hostVersion,
    status: statusFor(version, hostVersion),
  }));
  const table = renderTable(rows);

  console.log(table);

  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      fs.appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        `## Host Backstage version\n\n${table}\n`,
      );
    } catch (error) {
      console.error(
        `Could not write ${process.env.GITHUB_STEP_SUMMARY}: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }

  if (strict && rows.some(row => row.status === 'behind')) {
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack : error);
  // Report mode remains non-blocking, including unexpected read failures.
  process.exitCode = strict ? 1 : 0;
});
