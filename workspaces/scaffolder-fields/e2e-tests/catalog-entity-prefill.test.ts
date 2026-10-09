import { expect, Page, test } from '@playwright/test';

const TEMPLATE = '/create/templates/default/manage-skill';

async function openTemplate(page: Page) {
  await page.goto(TEMPLATE);
  await expect(
    page.getByRole('heading', { name: 'Manage a skill' }),
  ).toBeVisible();
}

async function chooseOperation(page: Page, operation: string) {
  await page.getByRole('button', { name: /operation/i }).click();
  await page.getByRole('option', { name: operation, exact: true }).click();
}

async function chooseSkill(page: Page, title: string) {
  await page.getByRole('textbox', { name: 'Skill' }).click();
  await page.getByRole('option', { name: title }).click();
}

const description = (page: Page) => page.getByLabel('Description');
const instructions = (page: Page) => page.getByLabel('Instructions');
const client = (page: Page) => page.getByLabel('Client');

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  // The local runner asks for a sign-in method; the dev shell has none.
  if (process.env.PLAYWRIGHT_URL) {
    const enter = page.getByRole('button', { name: 'Enter' });
    await enter.click();
    await expect(enter).toHaveCount(0);
  }
});

test('fills the step from the selected entity, keeps edits, refills on a new selection', async ({
  page,
}) => {
  await openTemplate(page);
  await chooseOperation(page, 'update');
  await chooseSkill(page, 'Code review');

  await expect(description(page)).toHaveValue(
    'Reviews a change set and lists its risks.',
  );
  await expect(instructions(page)).toHaveValue(/Read the diff/);
  await expect(client(page)).toHaveValue('client-a');

  await description(page).fill('Edited by hand');
  await expect(description(page)).toHaveValue('Edited by hand');

  await chooseSkill(page, 'Release notes');
  await expect(description(page)).toHaveValue(
    'Turns merged changes into release notes.',
  );
  await expect(instructions(page)).toHaveValue(/Summarize each merged change/);
  await expect(client(page)).toHaveValue('');
});

test('shows the filled fields read-only when the operation is remove', async ({
  page,
}) => {
  await openTemplate(page);
  await chooseOperation(page, 'remove');
  await chooseSkill(page, 'Code review');

  await expect(description(page)).toHaveValue(
    'Reviews a change set and lists its risks.',
  );
  await expect(description(page)).not.toBeEditable();
  await expect(instructions(page)).not.toBeEditable();
  await expect(client(page)).not.toBeEditable();

  await chooseOperation(page, 'update');
  await expect(description(page)).toHaveValue('');
  await expect(description(page)).toBeEditable();
});

test('drops the late response of a previous selection', async ({ page }) => {
  test.skip(
    !!process.env.PLAYWRIGHT_URL,
    'relies on the dev shell catalog delay',
  );
  await openTemplate(page);
  await chooseOperation(page, 'update');
  await chooseSkill(page, 'Slow skill');
  await expect(page.getByRole('status')).toBeVisible();
  await expect(description(page)).not.toBeEditable();

  await chooseSkill(page, 'Release notes');
  await expect(description(page)).toHaveValue(
    'Turns merged changes into release notes.',
  );

  await page.waitForTimeout(2500);
  await expect(description(page)).toHaveValue(
    'Turns merged changes into release notes.',
  );
  await expect(client(page)).toHaveValue('');
});

test('stays on the step until the entity has loaded', async ({ page }) => {
  test.skip(
    !!process.env.PLAYWRIGHT_URL,
    'relies on the dev shell catalog delay',
  );
  await openTemplate(page);
  await chooseOperation(page, 'update');
  await chooseSkill(page, 'Slow skill');
  await expect(page.getByRole('status')).toBeVisible();

  await page.getByRole('button', { name: 'Review' }).click();
  await page.waitForTimeout(500);
  await expect(page.getByRole('button', { name: 'Create' })).toHaveCount(0);

  await expect(page.getByRole('status')).toHaveCount(0);
  await page.getByRole('button', { name: 'Review' }).click();
  await expect(page.getByRole('button', { name: 'Create' })).toBeVisible();
});

test('submits the flat values of the step', async ({ page }) => {
  test.skip(!!process.env.PLAYWRIGHT_URL, 'reads a dev shell hook');
  await openTemplate(page);
  await chooseOperation(page, 'update');
  await chooseSkill(page, 'Code review');
  await expect(client(page)).toHaveValue('client-a');

  await page.getByRole('button', { name: 'Review' }).click();
  await page.getByRole('button', { name: 'Create' }).click();

  const requests = await page.evaluate(
    () => (window as any).scaffolderRequests,
  );
  expect(requests).toHaveLength(1);
  expect(requests[0].values).toEqual({
    operation: 'update',
    skill: 'resource:default/skill-code-review',
    description: 'Reviews a change set and lists its risks.',
    instructions:
      'Read the diff, group findings by severity and propose a fix for each one.',
    client: 'client-a',
  });
});

test('shows the status text in Brazilian Portuguese when the app language is pt-BR', async ({
  page,
}) => {
  test.skip(
    !!process.env.PLAYWRIGHT_URL,
    'relies on the dev shell catalog delay',
  );
  await page.addInitScript(() =>
    window.localStorage.setItem('language', 'pt-BR'),
  );
  await openTemplate(page);
  await chooseOperation(page, 'update');
  await chooseSkill(page, 'Slow skill');

  await expect(page.getByRole('status')).toHaveText(
    'Carregando dados do catálogo…',
  );
});
