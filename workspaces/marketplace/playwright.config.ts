import { defineConfig } from '@playwright/test';

const playwrightUrl = process.env.PLAYWRIGHT_URL;

export default defineConfig({
  timeout: 60_000,
  expect: {
    timeout: 5_000,
  },

  testDir: '.',
  testMatch: '**/e2e-tests/**/*.{spec,test}.{js,jsx,ts,tsx}',

  webServer: playwrightUrl
    ? undefined
    : {
        command: 'yarn start',
        url: 'http://localhost:7007/.backstage/health/v1/readiness',
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },

  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,

  reporter: [['html', { open: 'never', outputFolder: 'e2e-test-report' }]],

  use: {
    actionTimeout: 0,
    baseURL: playwrightUrl ?? 'http://localhost:3000',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },

  outputDir: 'node_modules/.cache/e2e-test-results',
});
