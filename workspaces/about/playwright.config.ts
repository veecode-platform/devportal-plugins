import { defineConfig } from '@playwright/test';

const baseConfig = `${__dirname}/app-config.yaml`;

export default defineConfig({
  timeout: 2 * 60 * 1000,
  expect: { timeout: 5_000 },
  webServer: process.env.PLAYWRIGHT_URL
    ? []
    : {
        command: `yarn start --config ${baseConfig}`,
        url: 'http://localhost:7007/.backstage/health/v1/readiness',
        timeout: 180_000,
        reuseExistingServer: !process.env.CI,
        cwd: __dirname,
      },
  retries: process.env.CI ? 2 : 0,
  reporter: [['html', { open: 'never', outputFolder: 'e2e-test-report' }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_URL ?? 'http://localhost:3000',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  outputDir: 'node_modules/.cache/e2e-test-results',
  testDir: 'e2e-tests',
});
