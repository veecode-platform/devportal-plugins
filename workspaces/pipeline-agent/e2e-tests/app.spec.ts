import { expect, test } from '@playwright/test';

test('the pipeline agent card shows on the CI tab of an entity with a GitLab project', async ({
  page,
}) => {
  await page.goto('/catalog/default/component/pedidos-api/ci-cd');
  await expect(page.getByText('Agente de pipeline')).toBeVisible({
    timeout: 30_000,
  });
});
