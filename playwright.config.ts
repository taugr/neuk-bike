import { defineConfig, devices } from '@playwright/test';

const e2ePort = Number(process.env.PLAYWRIGHT_PORT ?? 4173);
const baseURL = `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: [['list']],
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 3,
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
      NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY: 'playwright-google-maps-embed-key',
      NEXT_PUBLIC_OFFLINE_DOWNLOAD_REQUEST_INTERVAL_MS:
        process.env.OPENFREEMAP_SMOKE === '1' ? '200' : '0',
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
