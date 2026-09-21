import { expect, test } from '@playwright/test';

test('the AWS Cost Insights app harness reaches the catalog route', async ({
  page,
}) => {
  await page.goto('/catalog');
  await expect(page.locator('body')).toContainText('Catalog');
});
