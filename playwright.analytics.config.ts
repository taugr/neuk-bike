import { defineConfig, devices } from '@playwright/test';

const port = 4190;
export default defineConfig({
  testDir: './analytics-e2e',
  fullyParallel: true,
  workers: 2,
  retries: 0,
  timeout: 45_000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://127.0.0.1:${port}`,
    serviceWorkers: 'block',
  },
  webServer: {
    command: `pnpm exec next build --webpack && python3 -m http.server ${port} --directory out`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_CYCLESTREETS_API_KEY: 'playwright-local-route-key',
      NEXT_PUBLIC_POSTHOG_KEY: 'phc_neuk_analytics_test',
      NEXT_PUBLIC_POSTHOG_HOST: 'https://analytics.neuk.test',
      NEXT_PUBLIC_POSTHOG_FORCE_ENABLE: 'true',
    },
  },
});
