import { defineConfig } from '@playwright/test';
import { generateProjects } from '@backstage/e2e-test-utils/playwright';

export default defineConfig({
  timeout: 60_000,
  expect: {
    timeout: 5_000,
  },
  webServer: process.env.PLAYWRIGHT_URL
    ? []
    : {
        command: 'yarn start app',
        port: 3000,
        reuseExistingServer: true,
        timeout: 60_000,
      },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['html', { open: 'never', outputFolder: 'e2e-test-report' }]],
  use: {
    actionTimeout: 0,
    baseURL: process.env.PLAYWRIGHT_URL ?? 'http://localhost:3000',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  outputDir: 'node_modules/.cache/e2e-test-results',
  projects: generateProjects(),
});
