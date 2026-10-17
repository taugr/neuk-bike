import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { installOfflineMapFixture } from './offline-map-fixtures';
import { installWindJourneyFixture, openWindJourney } from './wind-fixtures';

const disabledBuild = process.env.WIND_FLAG_TEST === 'disabled';
const ukv = JSON.parse(
  readFileSync(
    new URL(
      '../src/lib/fixtures/ukv-edinburgh-2026-10-15.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
const regional = JSON.parse(
  readFileSync(
    new URL(
      '../src/lib/fixtures/regional-open-meteo-2026-10-16.json',
      import.meta.url,
    ),
    'utf8',
  ),
);

for (const width of [390, 1440]) {
  test(`disabled build hides both wind controls and makes no weather requests at ${width}px`, async ({
    page,
  }) => {
    test.skip(
      !disabledBuild,
      'Run against an export built with NEXT_PUBLIC_WIND_ENABLED=false.',
    );
    await page.setViewportSize({ width, height: 900 });
    await page.clock.install({ time: new Date() });
    await installWindJourneyFixture(page);
    let requests = 0;
    page.on('request', (request) => {
      if (request.url().startsWith('https://api.open-meteo.com/')) requests++;
    });
    await openWindJourney(page);
    await page.getByTestId('map-layers-trigger').click();
    await expect(page.getByTestId('wind-layer-toggle')).toHaveCount(0);
    await expect(page.getByTestId('journey-wind')).toHaveCount(0);
    await expect(page.getByTestId('drinking-water-layer-toggle')).toBeVisible();
    await page.clock.fastForward(35 * 60000);
    await expect(page.getByTestId('wind-overlay')).toHaveCount(0);
    expect(requests).toBe(0);
  });

  for (const city of ['Edinburgh', 'Yerevan']) {
    test(`public host loads live ${city} forecasts on demand at ${width}px`, async ({
      page,
      context,
      baseURL,
    }) => {
      test.skip(disabledBuild, 'Requires the enabled export.');
      await page.setViewportSize({ width, height: 900 });
      await page.clock.setFixedTime(
        new Date(
          city === 'Edinburgh'
            ? '2026-10-15T20:20:00Z'
            : '2026-10-16T16:50:00Z',
        ),
      );
      // Serve the local export under its public hostname without contacting production.
      await context.route('**/*', (route) => route.abort());
      await installOfflineMapFixture(context);
      await page.route('http://neuk.bike/**', async (route) => {
        const url = new URL(route.request().url());
        const response = await route.fetch({
          url: `${baseURL}${url.pathname}${url.search}`,
        });
        await route.fulfill({ response });
      });
      let requests = 0;
      await page.route('https://api.open-meteo.com/v1/forecast*', (route) => {
        requests++;
        return route.fulfill({
          json:
            city === 'Edinburgh'
              ? ukv.grid.slice(0, 20)
              : regional.find(
                  (entry: { provenance: { name: string } }) =>
                    entry.provenance.name === 'Yerevan',
                ).response,
        });
      });
      await page.goto(
        `http://neuk.bike/?${city === 'Edinburgh' ? 'lat=55.9533&lng=-3.1883' : 'lat=40.1777&lng=44.5126'}`,
      );
      await expect(page.getByTestId('parking-list')).toBeVisible();
      await page.getByTestId('map-layers-trigger').click();
      await expect(page.getByTestId('wind-layer-toggle')).not.toBeChecked();
      expect(requests).toBe(0);
      await page.getByTestId('wind-layer-toggle').check();
      await expect(page.locator('.wind-map-arrow').first()).toBeVisible({
        timeout: 10000,
      });
      await expect(page.getByTestId('wind-layer-status')).toHaveAttribute(
        'data-state',
        'available',
      );
      expect(requests).toBe(1);
    });
  }
}
