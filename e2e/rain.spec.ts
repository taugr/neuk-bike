import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import {
  installOfflineMapFixture,
  expectRenderedBasemap,
} from './offline-map-fixtures';

test.use({ serviceWorkers: 'block' });
const url = '/?mockGps=55.9533,-3.1883,5';
const tilePath = fileURLToPath(
  new URL('./fixtures/terrain.png', import.meta.url),
);
async function fixture(
  page: Page,
  mode: 'wet' | 'dry' | 'error' | 'stale' | 'slow' = 'wet',
) {
  const requests: string[] = [];
  await installOfflineMapFixture(page.context());
  await page.route('https://elevation-tiles-prod.s3.amazonaws.com/**', (r) =>
    r.fulfill({ contentType: 'image/png', path: tilePath }),
  );
  await page.route('https://services.arcgisonline.com/**', (r) =>
    r.fulfill({ contentType: 'image/png', path: tilePath }),
  );
  await page.route('https://api.open-meteo.com/v1/forecast*', async (route) => {
    const requestUrl = new URL(route.request().url());
    if (!requestUrl.searchParams.has('current')) return route.fallback();
    requests.push(requestUrl.href);
    if (mode === 'error')
      return route.fulfill({ status: 503, body: 'Unavailable' });
    if (mode === 'slow') {
      await new Promise((r) => setTimeout(r, 1500));
    }
    const now = await page.evaluate(() => Date.now());
    const latitudes = requestUrl.searchParams
      .get('latitude')!
      .split(',')
      .map(Number);
    const longitudes = requestUrl.searchParams
      .get('longitude')!
      .split(',')
      .map(Number);
    await route.fulfill({
      json: latitudes.map((latitude, i) => ({
        latitude,
        longitude: longitudes[i],
        elevation: 40,
        current_units: {
          time: 'unixtime',
          interval: 'seconds',
          rain: 'mm',
          showers: 'mm',
        },
        current: {
          time: Math.floor(now / 900000) * 900 - (mode === 'stale' ? 3600 : 0),
          interval: 900,
          rain: mode === 'dry' ? 0 : 1,
          showers: 0,
        },
      })),
    });
  });
  return requests;
}
async function enable(page: Page) {
  await page.goto(url);
  await expectRenderedBasemap(page);
  await page.getByTestId('map-layers-trigger').click();
  await page.getByRole('switch', { name: 'Rain', exact: true }).check();
}
for (const width of [390, 1440]) {
  test(`rain renders, persists and leaves controls usable at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const requests = await fixture(page);
    await page.goto(url);
    await expectRenderedBasemap(page);
    expect(requests).toHaveLength(0);
    await page.getByTestId('map-layers-trigger').click();
    await page.getByRole('switch', { name: 'Rain', exact: true }).check();
    await expect(page.getByTestId('rain-layer-status')).toContainText(
      'Estimated rain',
    );
    const canvas = page.getByTestId('rain-map-canvas');
    await expect
      .poll(async () =>
        Number(await canvas.getAttribute('data-rain-particles')),
      )
      .toBeGreaterThan(0);
    expect(
      await canvas.evaluate((c) => getComputedStyle(c).pointerEvents),
    ).toBe('none');
    await expect(canvas).toHaveAttribute('data-motion', 'animated');
    const pixels = () =>
      canvas.evaluate((c) => (c as HTMLCanvasElement).toDataURL());
    const before = await pixels();
    await expect.poll(pixels).not.toBe(before);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(canvas).toHaveAttribute('data-motion', 'static');
    await page.getByRole('switch', { name: 'Satellite', exact: true }).check();
    await expect(page.getByTestId('parking-map')).toHaveAttribute(
      'data-map-satellite',
      'ready',
    );
    await page.getByTestId('map-layers-trigger').click();
    await page
      .getByRole('button', { name: 'Switch to 3D map', exact: true })
      .click();
    await expect(page.getByTestId('parking-map')).toHaveAttribute(
      'data-map-terrain',
      'neuk-terrain',
      { timeout: 15000 },
    );
    await expect(canvas).toBeVisible();
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await expect
      .poll(async () =>
        Number(await canvas.getAttribute('data-rain-particles')),
      )
      .toBeGreaterThan(0);
    await page.reload();
    await page.getByTestId('map-layers-trigger').click();
    await expect(
      page.getByRole('switch', { name: 'Rain', exact: true }),
    ).toBeChecked();
    await expect(page.getByTestId('rain-layer-status')).toContainText(
      'Estimated rain',
      { timeout: 20000 },
    );
    await page.getByRole('switch', { name: 'Rain', exact: true }).uncheck();
    await expect(canvas).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
for (const mode of ['dry', 'error', 'stale'] as const) {
  test(`distinguishes ${mode} weather from rain`, async ({ page }) => {
    await fixture(page, mode);
    await enable(page);
    await expect(page.getByTestId('rain-layer-status')).toContainText(
      mode === 'dry' ? 'No rain expected' : 'Rain unavailable',
    );
    if (mode === 'dry')
      await expect(page.getByTestId('rain-map-canvas')).toHaveAttribute(
        'data-rain-particles',
        '0',
      );
    else await expect(page.getByTestId('rain-map-canvas')).toHaveCount(0);
  });
}
test('removes rain offline and restores a fresh cached area on reconnect', async ({
  page,
  context,
}) => {
  const requests = await fixture(page);
  await enable(page);
  await expect(page.getByTestId('rain-layer-status')).toContainText(
    'Estimated rain',
  );
  await context.setOffline(true);
  await expect(page.getByTestId('rain-layer-status')).toContainText('offline');
  await expect(page.getByTestId('rain-map-canvas')).toHaveCount(0);
  await context.setOffline(false);
  await expect(page.getByTestId('rain-layer-status')).toContainText(
    'Estimated rain',
  );
  expect(requests).toHaveLength(1);
});
test('turning rain off cancels an in-flight load', async ({ page }) => {
  const requests = await fixture(page, 'slow');
  await enable(page);
  await expect.poll(() => requests.length).toBe(1);
  await page.getByRole('switch', { name: 'Rain', exact: true }).uncheck();
  await expect(page.getByTestId('rain-map-canvas')).toHaveCount(0);
  await page.waitForTimeout(1700);
  await expect(page.getByTestId('rain-map-canvas')).toHaveCount(0);
  await expect(page.getByTestId('rain-layer-status')).toHaveCount(0);
});

test('refreshes enabled rain and expires it when the provider stops responding', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-10-23T12:00:00Z'));
  const requests = await fixture(page);
  await enable(page);
  await expect(page.getByTestId('rain-layer-status')).toContainText(
    'Estimated rain',
  );
  await page.clock.setFixedTime(new Date('2026-10-23T12:16:00Z'));
  // A normal offline/online transition triggers freshness checking after sleep.
  await page.context().setOffline(true);
  await page.context().setOffline(false);
  await expect.poll(() => requests.length).toBe(2);
  await expect(page.getByTestId('rain-layer-status')).toContainText(
    'Estimated rain',
  );
  await page.route('https://api.open-meteo.com/v1/forecast*', (r) =>
    r.fulfill({ status: 503, body: 'Unavailable' }),
  );
  await page.clock.setFixedTime(new Date('2026-10-23T12:47:00Z'));
  await page.context().setOffline(true);
  await page.context().setOffline(false);
  await expect(page.getByTestId('rain-layer-status')).toContainText(
    'Rain unavailable',
  );
  await expect(page.getByTestId('rain-map-canvas')).toHaveCount(0);
});

test('rain and regional wind coexist and share a request budget', async ({
  page,
}) => {
  await fixture(page);
  const weatherRequests: { current: boolean; time: number }[] = [];
  await page.route('https://api.open-meteo.com/v1/forecast*', async (route) => {
    const q = new URL(route.request().url()).searchParams;
    weatherRequests.push({ current: q.has('current'), time: Date.now() });
    if (q.has('current')) return route.fallback();
    const hour = await page.evaluate(
      () => new Date().toISOString().slice(0, 13) + ':00',
    );
    const lng = q.get('longitude')!.split(',').map(Number);
    return route.fulfill({
      json: q
        .get('latitude')!
        .split(',')
        .map((lat, i) => ({
          latitude: Number(lat),
          longitude: lng[i],
          utc_offset_seconds: 0,
          hourly_units: { wind_speed_10m: 'm/s', wind_direction_10m: '°' },
          hourly: {
            time: [hour],
            wind_speed_10m: [4],
            wind_direction_10m: [240],
          },
        })),
    });
  });
  await page.goto('/?lat=40.1777&lng=44.5126');
  await page.getByTestId('map-layers-trigger').click();
  await page.getByRole('switch', { name: 'Rain', exact: true }).check();
  await expect(page.getByTestId('rain-layer-status')).toContainText(
    'Estimated rain',
  );
  await page.getByTestId('wind-layer-toggle').check();
  await expect(page.getByTestId('wind-layer-status')).toContainText(
    'Regional forecast',
    { timeout: 20000 },
  );
  await expect(page.locator('.wind-map-arrow').first()).toBeVisible();
  await expect(page.getByTestId('rain-map-canvas')).toBeVisible();
  expect(weatherRequests).toHaveLength(2);
  expect(
    weatherRequests[1].time - weatherRequests[0].time,
  ).toBeGreaterThanOrEqual(9500);
});
