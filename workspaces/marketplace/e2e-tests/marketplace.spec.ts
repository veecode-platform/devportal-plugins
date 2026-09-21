import { expect, test } from '@playwright/test';

test('the marketplace route renders in the app harness', async ({ page }) => {
  await page.goto('/marketplace/catalog');
  await expect(page.getByRole('heading', { name: 'Extensions' })).toBeVisible();
});
