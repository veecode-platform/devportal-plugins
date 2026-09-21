/*
 * Copyright 2020 The Backstage Authors
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

import { test, expect } from '@playwright/test';

test('GitHub Workflows renders an annotated catalog entity', async ({ page }) => {
  await page.route('**/api/catalog/entities/by-name/**', async route => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'example-website',
          namespace: 'default',
          annotations: {
            'github.com/project-slug': 'mock-org/mock-repo',
            'github.com/workflows': 'ci.yml',
          },
        },
        spec: {
          type: 'website',
          lifecycle: 'experimental',
          owner: 'group:default/admins',
        },
      }),
    });
  });

  await page.route(
    '**/api/github-workflow-backend/workflows**',
    async route => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify([
          {
            workflow: {
              id: 1001,
              name: 'CI Build',
              state: 'active',
              url: 'https://github.com/mock-org/mock-repo/actions/workflows/ci.yml',
              path: '.github/workflows/ci.yml',
            },
            latestRun: {
              id: 5001,
              status: 'completed',
              conclusion: 'success',
            },
            parameters: [],
          },
        ]),
      });
    },
  );

  await page.route(
    '**/api/github-workflow-backend/branches**',
    async route => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify([
          {
            name: 'main',
            protected: true,
            commit: {
              sha: 'abc1234',
              url: 'https://api.github.com/repos/mock-org/mock-repo/commits/abc1234',
            },
          },
        ]),
      });
    },
  );

  await page.route(
    '**/api/github-workflow-backend/default-branch**',
    async route => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify('main'),
      });
    },
  );

  await page.goto('/');

  const enterButton = page.getByRole('button', { name: 'Enter' });
  await expect(enterButton).toBeVisible();
  await enterButton.click();

  await expect(page).toHaveURL(/\/catalog\/?$/);

  await page.goto('/catalog/default/component/example-website');

  await expect(page.getByText('Workflows', { exact: true })).toBeVisible();
  await expect(page.getByText('CI Build', { exact: true })).toBeVisible();
});
