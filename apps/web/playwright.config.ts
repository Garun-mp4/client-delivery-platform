import { defineConfig, devices } from '@playwright/test';

const webServerPort = process.env.WEB_SERVER_PORT ?? '3100';
const baseURL = process.env.WEB_BASE_URL ?? `http://localhost:${webServerPort}`;

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  workers: 2,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
    {
      name: 'mobile-chrome',
      testIgnore: [
        '**/identity.spec.ts',
        '**/materials.spec.ts',
        '**/projects.spec.ts',
        '**/questionnaires.spec.ts',
        '**/review.spec.ts',
      ],
      use: { ...devices['Pixel 7'], channel: 'chrome' },
    },
  ],
  webServer: [
    {
      command: 'pnpm start',
      env: { PORT: webServerPort, PUBLIC_APP_URL: baseURL },
      reuseExistingServer: false,
      timeout: 120_000,
      url: baseURL,
    },
    {
      command: 'pnpm --filter @garun/worker start',
      reuseExistingServer: true,
      timeout: 120_000,
      url: 'http://127.0.0.1:3001/health/live',
    },
  ],
});
