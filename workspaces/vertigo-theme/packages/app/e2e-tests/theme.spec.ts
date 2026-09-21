import { expect, test } from '@playwright/test';

test('the Vertigo theme app harness renders', async ({ page }) => {
  await page.goto('/theme');
  await expect(
    page.getByRole('heading', { name: 'Vertigo theme harness' }),
  ).toBeVisible();
});
