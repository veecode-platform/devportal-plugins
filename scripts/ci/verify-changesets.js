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

const fs = require('node:fs/promises');
const path = require('node:path');

const knownPrivatePackages = new Set([
  'app',
  'backend',
  'e2e-test',
  'storybook',
  'techdocs-cli-embedded-app',
]);

const ignoredDirectories = new Set([
  '.git',
  '.yarn',
  'build',
  'consumption',
  'coverage',
  'dist',
  'node_modules',
]);

function parseChangeset(content) {
  const lines = content.split(/\r?\n/);
  if (lines[0] !== '---') {
    throw new Error('Changeset must start with YAML frontmatter');
  }

  const end = lines.indexOf('---', 1);
  if (end === -1) {
    throw new Error('Changeset frontmatter is not closed');
  }

  const releases = [];
  for (const line of lines.slice(1, end)) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('#')) continue;

    const lineWithoutComment = trimmedLine.replace(/\s+#.*$/, '').trim();
    const match = lineWithoutComment.match(
      /^(?:'([^']+)'|"([^"]+)"|([^:#]+))\s*:\s*['"]?(major|minor|patch|none)['"]?$/,
    );
    if (!match) {
      throw new Error(`Invalid changeset release entry: ${line}`);
    }

    releases.push({ name: match[1] || match[2] || match[3].trim() });
  }

  return { releases };
}

async function collectPrivatePackages(workspaceRoot) {
  const privatePackages = new Set(knownPrivatePackages);

  async function visit(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    await Promise.all(entries.map(async entry => {
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) {
          await visit(path.join(directory, entry.name));
        }
        return;
      }

      if (entry.name !== 'package.json') return;

      const packagePath = path.join(directory, entry.name);
      const packageJson = JSON.parse(await fs.readFile(packagePath, 'utf8'));
      if (packageJson.private === true && typeof packageJson.name === 'string') {
        privatePackages.add(packageJson.name);
      }
    }));
  }

  await visit(workspaceRoot);
  return privatePackages;
}

async function verifyChangesets(repoRoot, workspace) {
  const workspaceRoot = path.join(repoRoot, 'workspaces', workspace);
  const changesetsFolderPath = path.join(
    workspaceRoot,
    '.changeset',
  );
  const privatePackages = await collectPrivatePackages(workspaceRoot);
  const fileNames = await fs.readdir(changesetsFolderPath);
  const changesetNames = fileNames.filter(
    name => name.endsWith('.md') && name !== 'README.md',
  );

  const changesets = await Promise.all(
    changesetNames.map(async name => {
      const content = await fs.readFile(
        path.join(changesetsFolderPath, name),
        'utf8',
      );
      return { name, ...parseChangeset(content) };
    }),
  );

  const errors = [];
  for (const changeset of changesets) {
    const privateReleases = changeset.releases.filter(release =>
      privatePackages.has(release.name),
    );
    if (privateReleases.length > 0) {
      const names = privateReleases
        .map(release => `'${release.name}'`)
        .join(', ');
      errors.push({
        name: changeset.name,
        messages: [
          `Should not contain releases of the following packages since they are not published: ${names}`,
        ],
      });
    }
  }

  return errors;
}

async function main() {
  if (process.argv.length < 3) {
    throw new Error('Usage: node verify-changesets.js name-of-the-workspace');
  }

  const errors = await verifyChangesets(
    path.resolve(__dirname, '..', '..'),
    process.argv[2],
  );

  if (errors.length) {
    console.log();
    console.log('***********************************************************');
    console.log('*             Changeset verification failed!              *');
    console.log('***********************************************************');
    console.log();
    for (const error of errors) {
      console.error(`Changeset '${error.name}' is invalid:`);
      console.log();
      for (const message of error.messages) {
        console.error(`  ${message}`);
      }
    }
    console.log();
    console.log('***********************************************************');
    console.log();
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack);
    process.exitCode = 1;
  });
}

module.exports = { parseChangeset, verifyChangesets };
