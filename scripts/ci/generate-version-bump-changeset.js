#!/usr/bin/env node
/*
 * Copyright The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

// Adapted from redhat-developer/rhdh-plugins scripts/ci/generate-version-bump-changeset.js.
// VeeCode workspaces are independent Yarn roots, so package discovery uses
// plain Node instead of the upstream root-only @manypkg/get-packages import.
// Every non-private plugin package is publishable here, regardless of scope.
//
// This script assumes that it is being run from the plugins workspace,
// for example: `/workspaces/kubernetes` and would be called like this:
// `node ../../scripts/ci/generate-version-bump-changeset.js 1.52.0 minor`

const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');

async function main() {
  const [script, releaseVersion, versionBumpType] = process.argv.slice(1);

  if (!releaseVersion || !versionBumpType) {
    throw new Error(
      `Argument must be ${script} <release-version> <version-bump-type>`,
    );
  }

  const workspacePlugins = path.join(process.cwd(), 'plugins');
  const workspaceChangesetFilename = `version-bump-${releaseVersion.replaceAll(
    '.',
    '-',
  )}.md`;
  const workspaceChangesetDirectory = path.join(process.cwd(), '.changeset');
  const workspaceChangeset = path.join(
    workspaceChangesetDirectory,
    workspaceChangesetFilename,
  );

  const packageEntries = fs
    .readdirSync(workspacePlugins, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => path.join(workspacePlugins, entry.name, 'package.json'))
    .filter(packageJsonPath => fs.existsSync(packageJsonPath))
    .map(packageJsonPath => JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')))
    .filter(packageJson => packageJson.name && packageJson.private !== true)
    .map(packageJson => `'${packageJson.name}': ${versionBumpType}`)
    .sort();

  const changeset = `---
${packageEntries.join('\n')}
---

Backstage version bump to v${releaseVersion}\n`;

  await fsp.mkdir(workspaceChangesetDirectory, { recursive: true });
  const configPath = path.join(workspaceChangesetDirectory, 'config.json');
  if (!fs.existsSync(configPath)) {
    await fsp.writeFile(
      configPath,
      `${JSON.stringify(
        {
          $schema: 'https://unpkg.com/@changesets/config@3.0.0/schema.json',
          changelog: '@changesets/cli/changelog',
          commit: false,
          fixed: [],
          linked: [],
          access: 'public',
          baseBranch: 'main',
          updateInternalDependencies: 'patch',
          privatePackages: { tag: false, version: false },
        },
        null,
        2,
      )}\n`,
    );
  }
  await fsp.writeFile(workspaceChangeset, changeset);
}

main().catch(error => {
  console.error(error.stack);
  process.exit(1);
});
