import { expect, test } from '@playwright/test';

test('renders the scaffolded frontend plugin', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter' }).click();
  if (process.env.PLAYWRIGHT_URL) {
    await expect(
      page.getByRole('link', { name: 'ScaffolderFields', exact: true }),
    ).toBeVisible({ timeout: 30_000 });
  }
  await page.goto('/scaffolder-fields');
  await expect(
    page.getByRole('heading', { name: 'Welcome to scaffolder-fields!' }),
  ).toBeVisible();
});
