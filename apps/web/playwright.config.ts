import { defineConfig, devices } from '@playwright/test';

const webServerPort = process.env.WEB_SERVER_PORT ?? '3100';
const baseURL = process.env.WEB_BASE_URL ?? `http://127.0.0.1:${webServerPort}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'], channel: 'chrome' } },
  ],
  webServer: {
    command: 'pnpm start',
    env: { PORT: webServerPort },
    reuseExistingServer: false,
    timeout: 120_000,
    url: baseURL,
  },
});
