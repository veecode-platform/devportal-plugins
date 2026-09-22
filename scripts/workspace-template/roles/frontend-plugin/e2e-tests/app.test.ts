import { expect, test } from '@playwright/test';

test('renders the scaffolded frontend plugin', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter' }).click();
  if (process.env.PLAYWRIGHT_URL) {
    await expect(
      page.getByRole('link', { name: '{{pascalName}}', exact: true }),
    ).toBeVisible({ timeout: 30_000 });
  }
  await page.goto('/{{name}}');
  await expect(
    page.getByRole('heading', { name: 'Welcome to {{name}}!' }),
  ).toBeVisible();
});
