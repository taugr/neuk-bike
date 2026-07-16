import { defineConfig, devices } from '@playwright/test';

const e2ePort = Number(process.env.PLAYWRIGHT_PORT ?? 4173);
const baseURL = `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: [['list']],
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: {
    command: [
      'pnpm exec next build --webpack',
      `python3 -m http.server ${e2ePort} --directory out`,
    ].join(' && '),
    env: {
      NEXT_PUBLIC_CYCLESTREETS_API_KEY: 'playwright-local-route-key',
    },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: baseURL,
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /mobile\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chrome',
      testMatch: /mobile\.spec\.ts/,
      use: { ...devices['Pixel 5'] },
    },
  ],
});
