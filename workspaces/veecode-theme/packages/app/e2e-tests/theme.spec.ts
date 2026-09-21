import { expect, test } from '@playwright/test';

test('the VeeCode theme app harness renders', async ({ page }) => {
  await page.goto('/theme');
  await expect(
    page.getByRole('heading', { name: 'VeeCode theme harness' }),
  ).toBeVisible();
});
