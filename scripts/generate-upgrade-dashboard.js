#!/usr/bin/env node
'use strict';

// Adapted from redhat-developer/rhdh-plugins scripts/generate-upgrade-dashboard.js.
// Upstream compares each workspace's backstage.json against the latest
// upstream Backstage release (versions.backstage.io). VeeCode workspaces
// target the DevPortal host's own Backstage version instead, so this
// compares against devportal-core's backstage.json (same source and env
// override as scripts/ci/check-backstage-version.js). It also drops the
// `semver` and `fs-extra` dependencies upstream uses, since this repo does
// not carry them at the root; version comparison reuses the plain-Node
// parser already in scripts/ci/check-backstage-version.js.

const fs = require('node:fs');
const path = require('node:path');

const HOST_URL =
  'https://raw.githubusercontent.com/veecode-platform/devportal-core/main/backstage.json';
const repoRoot = path.resolve(__dirname, '..');
const workspacesRoot = path.join(repoRoot, 'workspaces');

function parseVersion(value) {
  const match = String(value ?? '')
    .trim()
    .match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return null;
  }
  return match.slice(1, 4).map(Number);
}

// Positive: workspace is behind by that many minor versions on the same major.
// 10: major version behind. 0: same or ahead.
function minorVersionsBehind(currentVersion, hostVersion) {
  const current = parseVersion(currentVersion);
  const host = parseVersion(hostVersion);
  if (!current || !host) {
    return null;
  }

  if (current[0] !== host[0]) {
    return host[0] > current[0] ? 10 : 0;
  }

  return Math.max(0, host[1] - current[1]);
}

function listWorkspaces() {
  return fs
    .readdirSync(workspacesRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .filter(entry => fs.existsSync(path.join(workspacesRoot, entry.name, 'package.json')))
    .map(entry => entry.name)
    .sort();
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

function getWorkspaceVersions() {
  const workspaces = [];

  for (const workspaceName of listWorkspaces()) {
    const backstageJsonPath = path.join(workspacesRoot, workspaceName, 'backstage.json');
    if (!fs.existsSync(backstageJsonPath)) {
      continue;
    }
    try {
      const backstageJson = JSON.parse(fs.readFileSync(backstageJsonPath, 'utf8'));
      if (backstageJson.version) {
        workspaces.push({ name: workspaceName, version: backstageJson.version });
      }
    } catch (error) {
      console.warn(
        `Warning: Could not read version from ${workspaceName}/backstage.json:`,
        error.message,
      );
    }
  }

  return workspaces;
}

function categorizeWorkspaces(workspaces, hostVersion) {
  const tiers = { tier1: [], tier2: [], tier3: [] };

  workspaces.forEach(workspace => {
    const behind = minorVersionsBehind(workspace.version, hostVersion);
    if (behind >= 3) tiers.tier1.push(workspace);
    else if (behind === 2) tiers.tier2.push(workspace);
    else if (behind === 1) tiers.tier3.push(workspace);
  });

  Object.values(tiers).forEach(tier => tier.sort((a, b) => a.name.localeCompare(b.name)));

  return tiers;
}

function generateTierSummary(count, emoji, title) {
  if (count === 0) return '';
  return `- ${emoji} ${title}: **${count}**\n`;
}

function generateTierTable(workspaces, emoji, title) {
  if (workspaces.length === 0) return '';

  let output = `## ${emoji} ${title}\n\n`;
  output += '| Workspace | Current Version |\n';
  output += '|-----------|-----------------|\n';
  workspaces.forEach(workspace => {
    output += `| ${workspace.name} | ${workspace.version} |\n`;
  });
  return `${output}\n`;
}

function generateDashboard(workspaces, tiers, hostVersion) {
  let output = 'Tracking workspaces not on the DevPortal host Backstage minor version\n\n';
  output += `**DevPortal host version:** ${hostVersion}\n\n`;
  output += '---\n\n';

  const totalOutdated = tiers.tier1.length + tiers.tier2.length + tiers.tier3.length;
  if (totalOutdated === 0) {
    output += '## Summary: All workspaces are up to date! 🎉\n\n';
  } else {
    output += `## Summary: Outdated workspaces: ${totalOutdated}\n\n`;
  }
  const totalUpToDate = workspaces.length - totalOutdated;

  output += generateTierSummary(tiers.tier1.length, '🔴', '≥ 3 minor versions behind');
  output += generateTierSummary(tiers.tier2.length, '🟠', '2 minor versions behind');
  output += generateTierSummary(tiers.tier3.length, '🟡', '1 minor version behind');
  output += generateTierSummary(totalUpToDate, '🟢', 'up to date');
  output += '\n';

  output += generateTierTable(tiers.tier1, '🔴', '≥ 3 minor versions behind');
  output += generateTierTable(tiers.tier2, '🟠', '2 minor versions behind');
  output += generateTierTable(tiers.tier3, '🟡', '1 minor version behind');

  output += `*Dashboard generated on ${new Date().toISOString().split('T')[0]}*\n`;

  return output;
}

async function main() {
  const hostVersion = await getHostVersion();
  if (!hostVersion) {
    throw new Error(`Could not resolve the DevPortal host Backstage version from ${HOST_URL}`);
  }
  const workspaces = getWorkspaceVersions();
  const tiers = categorizeWorkspaces(workspaces, hostVersion);
  const dashboard = generateDashboard(workspaces, tiers, hostVersion);

  console.log(dashboard);
}

main().catch(error => {
  console.error('Error generating dashboard:', error);
  process.exit(1);
});

module.exports = {
  getHostVersion,
  getWorkspaceVersions,
  categorizeWorkspaces,
  generateDashboard,
};
