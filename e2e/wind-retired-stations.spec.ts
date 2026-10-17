import { expect as baseExpect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { installOfflineMapFixture } from './offline-map-fixtures';

// Allow the startup camera focus and forecast debounce, as in the other wind checks.
const expect = baseExpect.configure({ timeout: 10000 });

const raw = JSON.parse(
  readFileSync(
    new URL(
      '../src/lib/fixtures/ukv-edinburgh-2026-10-15.json',
      import.meta.url,
    ),
    'utf8',
  ),
).grid.slice(0, 20);

for (const width of [390, 1440]) {
  test(`retired station URL cannot enable observations and forecast still works at ${width}px`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.clock.setFixedTime(new Date('2026-10-15T20:20:00Z'));
    await installOfflineMapFixture(context);
    const stationRequests: string[] = [];
    page.on('request', (request) => {
      if (
        /edinburgh-stations|aviationweather|port-log|metstat_arch/.test(
          request.url(),
        )
      )
        stationRequests.push(request.url());
    });
    await page.route('https://api.open-meteo.com/v1/forecast*', (route) =>
      route.fulfill({ json: raw }),
    );
    await page.goto('/?windStations=1&lat=55.9533&lng=-3.1883');
    await page.getByTestId('map-layers-trigger').click();
    await expect(
      page.getByRole('switch', { name: 'Station snapshot experiment' }),
    ).toHaveCount(0);
    await expect(page.getByTestId('wind-layer-toggle')).not.toBeChecked();
    await page.getByTestId('wind-layer-toggle').check();
    await expect(page.locator('.wind-map-arrow').first()).toBeVisible();
    await expect(page.getByTestId('wind-overlay')).toContainText(
      'UKV ~2 km forecast',
    );
    await expect(page.locator('.wind-map-arrow').first()).toBeVisible();
    await expect(page.locator('.wind-station-marker')).toHaveCount(0);
    await expect(page.getByTestId('station-readings')).toHaveCount(0);
    expect(stationRequests).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
  });
}
