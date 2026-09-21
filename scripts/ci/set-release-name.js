#!/usr/bin/env node
'use strict';

// Adapted from redhat-developer/rhdh-plugins scripts/ci/set-release-name.js.
// Upstream resolves the target release from the GitHub backstage/backstage
// releases API (latest release vs. latest pre-release, per a `release_line`
// input). VeeCode pins every workspace to the DevPortal host's own Backstage
// version instead, so this resolves the release from devportal-core's
// backstage.json (same source and env override as scripts/ci/check-backstage-version.js).

const fs = require('node:fs');
const path = require('node:path');

const HOST_URL =
  'https://raw.githubusercontent.com/veecode-platform/devportal-core/main/backstage.json';

async function getBackstageVersion(workspace) {
  const file = path.resolve(`workspaces/${workspace}/backstage.json`);
  if (!fs.existsSync(file)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(file, 'utf8')).version || null;
}

async function getHostVersion() {
  const override = process.env.HOST_BACKSTAGE_VERSION?.trim();
  if (override) {
    return override;
  }

  const response = await fetch(HOST_URL);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  const document = await response.json();
  return document.version || null;
}

async function main() {
  const [script, workspace] = process.argv.slice(1);
  if (!workspace) {
    throw new Error(`Argument must be ${script} <workspace>`);
  }

  const currentVersion = await getBackstageVersion(workspace);
  const hostVersion = await getHostVersion();

  console.log(`Current Backstage version is: v${currentVersion ?? 'N/A'}`);
  console.log(`DevPortal host Backstage version is: v${hostVersion ?? 'N/A'}`);
  console.log();

  if (!hostVersion) {
    throw new Error(
      `Could not resolve the DevPortal host Backstage version from ${HOST_URL}`,
    );
  }

  if (!process.env.GITHUB_OUTPUT) {
    throw new Error('GITHUB_OUTPUT is not set');
  }

  await fs.promises.appendFile(
    process.env.GITHUB_OUTPUT,
    `release_version=${hostVersion}\ncurrent_version=${currentVersion ?? 'N/A'}\n`,
  );
}

main().catch(error => {
  console.error(error.stack);
  process.exit(1);
});
