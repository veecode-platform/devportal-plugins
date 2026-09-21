import { expect, test } from '@playwright/test';

test('the GitLab Pipelines app harness reaches the catalog route', async ({
  page,
}) => {
  await page.goto(process.env.PLAYWRIGHT_URL ? '/catalog' : '/');
  await expect(page).toHaveURL(/\/catalog$/);
  await expect(page.locator('body')).toContainText('Catalog');
});
