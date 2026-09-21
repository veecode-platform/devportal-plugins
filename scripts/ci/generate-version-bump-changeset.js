#!/usr/bin/env node
'use strict';

// Copied from redhat-developer/rhdh-plugins scripts/ci/generate-version-bump-changeset.js
// with one change: the package-name filter targets VeeCode's own npm scope
// (@veecode-platform) instead of upstream's (@red-hat-developer-hub), so the
// changeset only lists packages this repo actually owns and publishes.
//
// This script assumes that it is being run from the plugins workspace,
// for example: `/workspaces/kubernetes` and would be called like this:
// `node ../../scripts/ci/generate-version-bump-changeset.js 1.52.0 minor`

const fs = require('node:fs/promises');
const path = require('node:path');

async function main() {
  const [script, releaseVersion, versionBumpType] = process.argv.slice(1);

  if (!releaseVersion || !versionBumpType) {
    throw new Error(
      `Argument must be ${script} <release-version> <version-bump-type>`,
    );
  }

  const { getPackages } = await import('@manypkg/get-packages');

  const workspacePlugins = path.join(process.cwd(), 'plugins');
  const workspaceChangesetFilename = `version-bump-${releaseVersion.replaceAll(
    '.',
    '-',
  )}.md`;
  const workspaceChangeset = path.join(
    process.cwd(),
    `.changeset/${workspaceChangesetFilename}`,
  );

  // Get the packages for this workspace filtering down to just those in the
  // `@veecode-platform` org, as this avoids including any sample `app`
  // and/or sample `backend` in the changeset.
  const { packages } = await getPackages(workspacePlugins);
  const packageEntries = packages
    .filter(p => p.packageJson.name.includes('@veecode-platform'))
    .map(p => `'${p.packageJson.name}': ${versionBumpType}`);

  const changeset = `---
${packageEntries.join('\n')}
---

Backstage version bump to v${releaseVersion}\n`;

  await fs.writeFile(workspaceChangeset, changeset);
}

main().catch(error => {
  console.error(error.stack);
  process.exit(1);
});
