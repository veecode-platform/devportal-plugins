import { expect, test, type Page, type TestInfo } from '@playwright/test';

// The dev shell serves the fake agent (packages/app/src/dev), so the flow runs
// without an Anthropic key or a GitLab token.
const CI_CD = '/catalog/default/component/pedidos-api/ci-cd';
const INVESTIGAR = 'Investigar e corrigir';
const APROVAR = 'Aprovar e abrir MR';

async function abrirCartao(page: Page, tema: 'light' | 'dark') {
  // The dev shell scrolls inside its layout, so a tall viewport keeps the whole card in one capture.
  await page.setViewportSize({ width: 1280, height: 1500 });
  await page.addInitScript(
    nome => window.localStorage.setItem('theme', nome),
    tema,
  );
  await page.goto(CI_CD);
  // The dev shell opens on the guest sign-in page in every new browser context.
  await page.getByRole('button', { name: 'Enter' }).click({ timeout: 30_000 });
  await expect(page.getByText('Agente de pipeline')).toBeVisible({
    timeout: 30_000,
  });
}

// Writes the capture under the test's output folder and attaches it to the
// report, so a run leaves the evidence where the reviewer can find it.
async function capturar(page: Page, testInfo: TestInfo, nome: string) {
  const caminho = testInfo.outputPath(`${nome}.png`);
  await page.screenshot({ path: caminho, fullPage: true });
  await testInfo.attach(nome, { path: caminho, contentType: 'image/png' });
}

test('the card takes a failed pipeline to a green merge request', async ({
  page,
}, testInfo) => {
  await abrirCartao(page, 'light');

  await expect(page.getByRole('button', { name: INVESTIGAR })).toBeEnabled({
    timeout: 30_000,
  });
  await capturar(page, testInfo, 'ocioso');

  await page.getByRole('button', { name: INVESTIGAR }).click();
  await expect(page.getByRole('button', { name: APROVAR })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText('Diagnóstico · tentativa 1')).toBeVisible();
  await capturar(page, testInfo, 'diagnostico');

  await page.getByRole('button', { name: APROVAR }).click();
  await expect(page.getByText(/MR !3 aberto/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Pipeline do MR passou/)).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText('Diagnóstico e mudança aprovados')).toBeVisible();
  await expect(page.getByRole('button', { name: APROVAR })).toHaveCount(0);
  await expect(
    page.getByText(/Do clique ao verde: \d+m \d+s · custo da sessão/),
  ).toBeVisible();
  await capturar(page, testInfo, 'verde');
});

test('the diagnosis reads in dark mode', async ({ page }, testInfo) => {
  await abrirCartao(page, 'dark');

  await page.getByRole('button', { name: INVESTIGAR }).click();
  await expect(page.getByRole('button', { name: APROVAR })).toBeVisible({
    timeout: 30_000,
  });

  const fundo = await page.evaluate(
    () => getComputedStyle(document.body).backgroundColor,
  );
  const [vermelho, verde, azul] = (fundo.match(/\d+/g) ?? []).map(Number);
  expect(fundo).not.toBe('rgba(0, 0, 0, 0)');
  expect((vermelho + verde + azul) / 3).toBeLessThan(64);

  await capturar(page, testInfo, 'diagnostico-escuro');
});
