import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import {
  installOfflineMapFixture,
  expectRenderedBasemap,
} from './offline-map-fixtures';
import { rainRegion } from '../src/lib/rain';
import { windRegion } from '../src/lib/regional-wind';

test.use({ serviceWorkers: 'block' });
const terrainTile = fileURLToPath(
  new URL('./fixtures/terrain.png', import.meta.url),
);

async function zoomTo(page: Page, target: number) {
  const map = page.getByTestId('parking-map');
  const initial = Number(await map.getAttribute('data-map-zoom'));
  const direction = initial > target ? -1 : 1;
  for (let i = 0; i < Math.round(Math.abs(initial - target)); i++) {
    const previous = Number(await map.getAttribute('data-map-zoom'));
    await page
      .getByRole('button', {
        name: direction < 0 ? 'Zoom out' : 'Zoom in',
        exact: true,
      })
      .click();
    await expect
      .poll(
        async () =>
          direction *
          (Number(await map.getAttribute('data-map-zoom')) - previous),
      )
      .toBeGreaterThan(0.95);
  }
}

for (const scenario of [
  {
    name: 'Armenia desktop 2D',
    width: 1440,
    lat: 40.1777,
    lng: 44.5126,
    terrain: false,
    zoom: 6,
  },
  {
    name: 'Scotland mobile 3D',
    width: 390,
    lat: 55.9533,
    lng: -3.1883,
    terrain: true,
    zoom: 5,
  },
]) {
  test(`rain and wind cover local and country views: ${scenario.name}`, async ({
    page,
    context,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: scenario.width, height: 844 });
    await installOfflineMapFixture(context);
    await page.route('https://elevation-tiles-prod.s3.amazonaws.com/**', (r) =>
      r.fulfill({ contentType: 'image/png', path: terrainTile }),
    );
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const requests: { rain: boolean; url: string; span: number }[] = [];
    await page.route(
      'https://api.open-meteo.com/v1/forecast*',
      async (route) => {
        const url = new URL(route.request().url());
        const latitudes = url.searchParams
          .get('latitude')!
          .split(',')
          .map(Number);
        const longitudes = url.searchParams
          .get('longitude')!
          .split(',')
          .map(Number);
        const rain = url.searchParams.has('current');
        expect(latitudes).toHaveLength(20);
        requests.push({
          rain,
          url: url.href,
          span: Math.max(...longitudes) - Math.min(...longitudes),
        });
        // Synthetic, spatially varying conditions test the full provider path.
        // The live visual preview separately uses real forecasts.
        const now = await page.evaluate(() => Date.now());
        await route.fulfill({
          json: latitudes.map((latitude, i) => ({
            latitude,
            longitude: longitudes[i],
            elevation: 50,
            utc_offset_seconds: 0,
            current_units: {
              time: 'unixtime',
              interval: 'seconds',
              rain: 'mm',
              showers: 'mm',
              snowfall: 'cm',
              weather_code: 'wmo code',
            },
            current: {
              time: Math.floor(now / 900000) * 900,
              interval: 900,
              rain: 0.5 + (i % 5) / 4,
              showers: 0,
              snowfall: 0,
              weather_code: 63,
            },
            hourly_units: { wind_speed_10m: 'm/s', wind_direction_10m: '°' },
            hourly: {
              time: [new Date(now).toISOString().slice(0, 13) + ':00'],
              wind_speed_10m: [3 + (i % 5)],
              wind_direction_10m: [130 + (i % 5) * 10],
            },
          })),
        });
      },
    );
    await page.goto(`/?lat=${scenario.lat}&lng=${scenario.lng}`);
    const map = page.getByTestId('parking-map');
    await expect(map).toHaveAttribute('data-map-initializing', 'false');
    // This shared basemap fixture contains geometry around Edinburgh only.
    if (scenario.terrain) await expectRenderedBasemap(page);
    // Wait for automatic framing before exercising the user's zoom controls.
    let previous = '',
      stable = Date.now();
    await expect
      .poll(async () => {
        const next = await map.getAttribute('data-map-zoom');
        if (previous !== next) {
          previous = next!;
          stable = Date.now();
        }
        return Date.now() - stable;
      })
      .toBeGreaterThan(700);
    await zoomTo(page, 14);
    if (scenario.terrain) {
      await page
        .getByRole('button', { name: 'Switch to 3D map', exact: true })
        .click();
      await expect
        .poll(async () => Number(await map.getAttribute('data-map-pitch')))
        .toBeGreaterThan(50);
    }
    await page.getByTestId('map-layers-trigger').click();
    await page.getByRole('switch', { name: 'Weather', exact: true }).check();
    await page.getByTestId('wind-layer-toggle').check();
    await expect(page.getByTestId('rain-layer-status')).toContainText(
      'Estimated rain',
      { timeout: 25000 },
    );
    await expect(page.getByTestId('wind-layer-status')).toHaveAttribute(
      'data-state',
      'available',
      { timeout: 25000 },
    );
    await page.getByTestId('map-layers-trigger').click();
    await zoomTo(page, scenario.zoom);
    await page.getByTestId('map-layers-trigger').click();
    const view = await map.evaluate((el) => ({
      west: Number(el.getAttribute('data-map-west')),
      east: Number(el.getAttribute('data-map-east')),
      south: Number(el.getAttribute('data-map-south')),
      north: Number(el.getAttribute('data-map-north')),
    }));
    expect(
      Math.max(view.east - view.west, view.north - view.south),
    ).toBeGreaterThan(3);
    const rainUrl = rainRegion(view)!.url;
    const windUrl = windRegion(view)!.url;
    await expect
      .poll(() => requests.some((r) => r.url === rainUrl), { timeout: 25000 })
      .toBe(true);
    await expect
      .poll(() => requests.some((r) => r.url === windUrl), { timeout: 25000 })
      .toBe(true);
    await expect(page.getByTestId('wind-layer-status')).toHaveAttribute(
      'data-state',
      'available',
      { timeout: 25000 },
    );
    await expect
      .poll(async () =>
        Number(
          await page
            .getByTestId('rain-map-canvas')
            .getAttribute('data-rain-particles'),
        ),
      )
      .toBeGreaterThan(30);
    const arrows = await page.locator('.wind-map-arrow').evaluateAll((els) =>
      els.map((el) => ({
        lng: Number(el.getAttribute('data-longitude')),
        lat: Number(el.getAttribute('data-latitude')),
      })),
    );
    const visible = arrows.filter(
      (p) =>
        p.lng >= view.west &&
        p.lng <= view.east &&
        p.lat >= view.south &&
        p.lat <= view.north,
    );
    expect(visible.length).toBeGreaterThanOrEqual(scenario.width < 700 ? 4 : 8);
    // A tilted phone viewport is a trapezoid, so its bounding rectangle can be
    // much wider than the on-screen map. Prove arrows extend beyond the old
    // two-degree local field instead of assuming a rectangular fill ratio.
    expect(
      Math.max(
        Math.max(...visible.map((p) => p.lng)) -
          Math.min(...visible.map((p) => p.lng)),
        Math.max(...visible.map((p) => p.lat)) -
          Math.min(...visible.map((p) => p.lat)),
      ),
    ).toBeGreaterThan(3);
    expect(
      await page.getByTestId('rain-map-canvas').evaluate((el) => {
        const canvas = el as HTMLCanvasElement;
        const pixels = canvas
          .getContext('2d')!
          .getImageData(0, 0, canvas.width, canvas.height).data;
        let visible = 0;
        for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) visible++;
        return visible;
      }),
    ).toBeGreaterThan(100);
    await page.getByTestId('map-layers-trigger').click();
    await zoomTo(page, 14);
    await page.getByTestId('map-layers-trigger').click();
    await expect(page.getByTestId('rain-layer-status')).toContainText(
      'Estimated rain',
      { timeout: 25000 },
    );
    await expect(page.getByTestId('wind-layer-status')).toHaveAttribute(
      'data-state',
      'available',
      { timeout: 25000 },
    );
    await expect(page.locator('.wind-map-arrow').first()).toBeAttached();
    await expect(page.getByTestId('rain-map-canvas')).toHaveAttribute(
      'data-motion',
      'animated',
    );
    expect(requests.some((r) => r.rain && r.span <= 1)).toBe(true);
    expect(requests.some((r) => !r.rain && r.span <= 2)).toBe(true);
    expect(requests.some((r) => r.rain && r.span > 3)).toBe(true);
    expect(requests.some((r) => !r.rain && r.span > 3)).toBe(true);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(scenario.width);
    expect(errors).toEqual([]);
  });
}
