// Allow startup camera focus plus the deliberate forecast debounce.
import { expect as baseExpect, test } from '@playwright/test';
const expect = baseExpect.configure({ timeout: 10000 });
import { readFileSync } from 'node:fs';
import { installOfflineMapFixture } from './offline-map-fixtures';
const raw = JSON.parse(
  readFileSync(
    new URL(
      '../src/lib/fixtures/ukv-edinburgh-2026-10-15.json',
      import.meta.url,
    ),
    'utf8',
  ),
).grid.slice(0, 20);
const now = new Date('2026-10-15T20:20:00Z');
test.beforeEach(async ({ page, context }) => {
  await page.clock.setFixedTime(now);
  await installOfflineMapFixture(context);
});
for (const width of [390, 1440])
  test(`lazy wind state, retained forecast and uncluttered map at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    let requests = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(
      'https://api.open-meteo.com/v1/forecast*',
      async (route) => {
        requests++;
        await gate;
        await route.fulfill({ json: raw });
      },
    );
    await page.goto('/');
    await page.getByTestId('map-layers-trigger').click();
    const status = page.getByTestId('wind-layer-status'),
      toggle = page.getByTestId('wind-layer-toggle');
    await expect(status).toHaveAttribute('data-state', 'idle');
    await expect(status).toHaveText('Turn on to load forecast');
    expect(requests).toBe(0);
    await toggle.check();
    await expect(status).toHaveText('Loading forecast…');
    await expect(page.getByTestId('wind-feedback')).toHaveText(
      'Loading forecast…',
    );
    release();
    await expect(status).toHaveAttribute('data-state', 'available');
    await expect(status).toContainText('20:00 UTC');
    await expect(toggle).toHaveAccessibleDescription(/UKV.*20:00 UTC/);
    await expect(page.locator('.wind-map-arrow').first()).toBeVisible();
    await expect(page.getByTestId('forecast-cells')).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: 'Try the demo route' }),
    ).toHaveCount(0);
    await expect(page.locator('.wind-map-speed').first()).toContainText('km/h');
    await expect(page.locator('.wind-map-caption')).toHaveCount(0);
    await expect(page.getByTestId('wind-overlay')).toHaveClass('sr-only');
    await expect(page.getByTestId('wind-overlay')).toHaveAttribute(
      'aria-label',
      /20:00 UTC.*air movement/,
    );
    await toggle.uncheck();
    await expect(page.locator('.wind-map-arrow')).toHaveCount(0);
    await expect(status).toHaveAttribute('data-state', 'available');
    await toggle.check();
    await expect(status).toHaveAttribute('data-state', 'available');
    expect(requests).toBe(1);
    await page.getByTestId('map-layers-trigger').click();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
  });
test('genuine failure is announced without the map box, and toggling retries successfully', async ({
  page,
}) => {
  let fail = true;
  await page.route('https://api.open-meteo.com/v1/forecast*', (r) =>
    fail
      ? r.fulfill({ status: 503, body: 'unavailable' })
      : r.fulfill({ json: raw }),
  );
  await page.goto('/');
  await page.getByTestId('map-layers-trigger').click();
  const status = page.getByTestId('wind-layer-status'),
    toggle = page.getByTestId('wind-layer-toggle');
  await expect(status).toHaveAttribute('data-state', 'idle');
  await toggle.check();
  await expect(status).toHaveAttribute('data-state', 'error');
  await expect(status).toHaveText('Forecast unavailable');
  await expect(page.locator('.wind-map-arrow')).toHaveCount(0);
  await page.getByTestId('map-layers-trigger').click();
  await expect(page.getByTestId('wind-feedback')).toHaveText(
    'Forecast unavailable',
  );
  await expect(
    page.getByTestId('map-layers-trigger'),
  ).toHaveAccessibleDescription('Forecast unavailable');
  fail = false;
  await page.getByTestId('map-layers-trigger').click();
  await toggle.uncheck();
  await toggle.check();
  await expect(status).toHaveAttribute('data-state', 'available');
  await expect(page.locator('.wind-map-arrow').first()).toBeVisible();
});
test('cancelling a pending lazy load returns to idle rather than claiming failure', async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('https://api.open-meteo.com/v1/forecast*', async (r) => {
    await gate;
    await r.fulfill({ json: raw });
  });
  await page.goto('/');
  await page.getByTestId('map-layers-trigger').click();
  const status = page.getByTestId('wind-layer-status'),
    toggle = page.getByTestId('wind-layer-toggle');
  await toggle.check();
  await expect(status).toHaveAttribute('data-state', 'loading');
  await toggle.uncheck();
  await expect(status).toHaveAttribute('data-state', 'idle');
  release();
  await expect(page.getByTestId('wind-feedback')).toHaveText('');
  await toggle.check();
  await expect(status).toHaveAttribute('data-state', 'available');
});
test('a retained forecast expires while the layer is disabled and reloads when enabled', async ({
  page,
}) => {
  await page.clock.install({ time: now });
  let requests = 0;
  await page.route('https://api.open-meteo.com/v1/forecast*', (r) => {
    requests++;
    return r.fulfill({ json: raw });
  });
  await page.goto('/');
  await page.getByTestId('map-layers-trigger').click();
  const status = page.getByTestId('wind-layer-status'),
    toggle = page.getByTestId('wind-layer-toggle');
  await toggle.check();
  await expect(status).toHaveAttribute('data-state', 'available');
  await toggle.uncheck();
  await page.clock.fastForward(121 * 60000);
  await expect(status).toHaveAttribute('data-state', 'stale');
  await expect(status).toHaveText('Forecast out of date');
  expect(requests).toBe(1);
  await expect(page.locator('.wind-map-arrow')).toHaveCount(0);
  await toggle.check();
  await expect(status).toHaveAttribute('data-state', 'available');
  await expect(status).toContainText('22:00 UTC');
  expect(requests).toBe(2);
});
