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
  weather: { rain: number; snowfall: number; weather_code: number } = {
    rain: 1,
    snowfall: 0,
    weather_code: 63,
  },
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
          snowfall: 'cm',
          weather_code: 'wmo code',
        },
        current: {
          time: Math.floor(now / 900000) * 900 - (mode === 'stale' ? 3600 : 0),
          interval: 900,
          rain: mode === 'dry' ? 0 : weather.rain,
          showers: 0,
          snowfall: weather.snowfall,
          weather_code: weather.weather_code,
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
  await page.getByRole('switch', { name: 'Weather', exact: true }).check();
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
    await page.getByRole('switch', { name: 'Weather', exact: true }).check();
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
      page.getByRole('switch', { name: 'Weather', exact: true }),
    ).toBeChecked();
    await expect(page.getByTestId('rain-layer-status')).toContainText(
      'Estimated rain',
      { timeout: 20000 },
    );
    await page.getByRole('switch', { name: 'Weather', exact: true }).uncheck();
    await expect(canvas).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
for (const mode of ['dry', 'error', 'stale'] as const) {
  test(`distinguishes ${mode} weather from rain`, async ({ page }) => {
    await fixture(page, mode);
    await enable(page);
    await expect(page.getByTestId('rain-layer-status')).toContainText(
      mode === 'dry' ? 'Dry ·' : 'Weather unavailable',
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
  await page.getByRole('switch', { name: 'Weather', exact: true }).uncheck();
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
    'Weather unavailable',
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
  await page.getByRole('switch', { name: 'Weather', exact: true }).check();
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

for (const terrain of [false, true]) {
  test(`rain stays continuous while panning across grids in ${terrain ? '3D' : '2D'}`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: 1440, height: 844 });
    const start = new Date('2026-10-24T12:00:00Z');
    await page.clock.setFixedTime(start);
    const requests = await fixture(page);
    await page.goto(url);
    await expectRenderedBasemap(page);
    const map = page.getByTestId('parking-map');
    // Let the initial nearby-results camera finish before choosing our view.
    let lastZoom = '',
      stableSince = Date.now();
    await expect
      .poll(async () => {
        const zoom = await map.getAttribute('data-map-zoom');
        if (zoom !== lastZoom) {
          lastZoom = zoom!;
          stableSince = Date.now();
        }
        return Date.now() - stableSince;
      })
      .toBeGreaterThan(600);
    while (Number(await map.getAttribute('data-map-zoom')) > 14.5) {
      const zoom = Number(await map.getAttribute('data-map-zoom'));
      await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
      await expect
        .poll(async () => Number(await map.getAttribute('data-map-zoom')))
        .toBeLessThan(zoom - 0.8);
    }
    if (terrain) {
      await page
        .getByRole('button', { name: 'Switch to 3D map', exact: true })
        .click();
      await expect
        .poll(async () => Number(await map.getAttribute('data-map-pitch')))
        .toBeCloseTo(55);
    }
    await page.getByTestId('map-layers-trigger').click();
    await page.getByRole('switch', { name: 'Weather', exact: true }).check();
    const rain = page.getByTestId('rain-map-canvas');
    await expect
      .poll(async () => Number(await rain.getAttribute('data-rain-particles')))
      .toBeGreaterThan(20);
    await page.getByTestId('map-layers-trigger').click();
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let pending = false;
    await page.route(
      'https://api.open-meteo.com/v1/forecast*',
      async (route) => {
        if (!new URL(route.request().url()).searchParams.has('current'))
          return route.fallback();
        pending = true;
        await held;
        await route.fallback();
      },
    );
    // Exercise an actual network wait without waiting for the shared throttle.
    await page.clock.setFixedTime(new Date(start.getTime() + 20000));
    await rain.evaluate((original) => {
      original.setAttribute('data-continuity', 'original');
      const root = document.documentElement;
      root.dataset.rainSampling = 'true';
      root.dataset.rainMissing = '0';
      root.dataset.rainBlank = '0';
      let last = 0;
      const sample = (now: number) => {
        if (root.dataset.rainSampling !== 'true') return;
        if (!original.isConnected) root.dataset.rainMissing = '1';
        if (now - last > 100) {
          const c = original as HTMLCanvasElement;
          const pixels = c
            .getContext('2d')!
            .getImageData(0, 0, c.width, c.height).data;
          if (!pixels.some((v, i) => i % 4 === 3 && v > 0))
            root.dataset.rainBlank = '1';
          last = now;
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    try {
      const box = (await page.locator('.maplibregl-canvas').boundingBox())!;
      // Cross the nearest grid boundary. A pitched viewport requests a wider
      // grid, so always dragging west can require several unnecessary gestures.
      const longitudes = new URL(requests.at(-1)!).searchParams
        .get('longitude')!
        .split(',')
        .map(Number);
      const gridCentre =
        (Math.min(...longitudes) + Math.max(...longitudes)) / 2;
      const viewCentre =
        (Number(await map.getAttribute('data-map-west')) +
          Number(await map.getAttribute('data-map-east'))) /
        2;
      const direction = viewCentre > gridCentre ? -1 : 1;
      for (let i = 0; i < 5 && !pending; i++) {
        const x = box.x + box.width * (direction > 0 ? 0.2 : 0.8),
          y = box.y + box.height * 0.65;
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + direction * box.width * 0.6, y, {
          steps: 12,
        });
        await page.waitForTimeout(200); // release without inertial camera motion
        await page.mouse.up();
        // Viewport debounce (500ms) plus request debounce (650ms).
        await page.waitForTimeout(1400);
      }
      expect(pending).toBe(true);
      await expect(rain).toHaveAttribute('data-continuity', 'original');
      await expect(page.locator('html')).toHaveAttribute(
        'data-rain-missing',
        '0',
      );
      await expect(page.locator('html')).toHaveAttribute(
        'data-rain-blank',
        '0',
      );
      release();
      await expect.poll(() => requests.length).toBe(2);
      await page.getByTestId('map-layers-trigger').click();
      await expect(page.getByTestId('rain-layer-status')).toHaveAttribute(
        'data-state',
        'ready',
      );
      await expect(rain).toHaveAttribute('data-continuity', 'original');
      await expect(page.locator('html')).toHaveAttribute(
        'data-rain-missing',
        '0',
      );
      await expect(page.locator('html')).toHaveAttribute(
        'data-rain-blank',
        '0',
      );
    } finally {
      release();
      if (!page.isClosed())
        await page
          .evaluate(() => {
            document.documentElement.dataset.rainSampling = 'false';
          })
          .catch(() => {
            /* The runner may already be closing a timed-out page. */
          });
    }
  });
}

for (const scenario of [
  {
    name: 'fog',
    rain: 0,
    snowfall: 0,
    weather_code: 45,
    label: 'Estimated fog',
    counts: ['fog'],
    width: 390,
  },
  {
    name: 'rime fog',
    rain: 0,
    snowfall: 0,
    weather_code: 48,
    label: 'Estimated fog',
    counts: ['fog'],
    width: 1440,
  },
  {
    name: 'snow',
    rain: 0,
    snowfall: 0.1,
    weather_code: 71,
    label: 'Estimated snow',
    counts: ['snow'],
    width: 390,
  },
  {
    name: 'mixed',
    rain: 0.2,
    snowfall: 0.1,
    weather_code: 73,
    label: 'Estimated rain and snow',
    counts: ['rain', 'snow'],
    width: 1440,
  },
  {
    name: 'freezing',
    rain: 0.5,
    snowfall: 0,
    weather_code: 67,
    label: 'Estimated freezing rain',
    counts: ['freezing'],
    width: 390,
  },
  {
    name: 'hail',
    rain: 3,
    snowfall: 0,
    weather_code: 99,
    label: 'Estimated thunderstorms with hail',
    counts: ['rain', 'hail'],
    width: 1440,
  },
  {
    name: 'dry thunderstorm',
    rain: 0,
    snowfall: 0,
    weather_code: 95,
    label: 'Estimated thunderstorms',
    counts: [],
    width: 1440,
  },
]) {
  test(`weather renders ${scenario.name} and respects reduced motion`, async ({
    page,
  }) => {
    test.setTimeout(45000);
    await page.setViewportSize({ width: scenario.width, height: 844 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await fixture(page, 'wet', scenario);
    await enable(page);
    await expect(page.getByTestId('rain-layer-status')).toContainText(
      scenario.label,
    );
    const canvas = page.getByTestId('rain-map-canvas');
    for (const kind of scenario.counts)
      await expect
        .poll(async () =>
          Number(await canvas.getAttribute(`data-${kind}-count`)),
        )
        .toBeGreaterThan(0);
    if (scenario.rain === 0)
      await expect(canvas).toHaveAttribute('data-rain-count', '0');
    if (scenario.weather_code >= 95) {
      await expect
        .poll(() => canvas.getAttribute('data-lightning'), {
          timeout: 12000,
          intervals: [80],
        })
        .toBe('visible');
    }
    await page.getByTestId('map-layers-trigger').click();
    await page
      .getByRole('button', { name: 'Switch to 3D map', exact: true })
      .click();
    // Terrain waits up to 15 seconds for a loaded DEM before tilting.
    await expect
      .poll(
        async () =>
          Number(
            await page
              .getByTestId('parking-map')
              .getAttribute('data-map-pitch'),
          ),
        { timeout: 15000 },
      )
      .toBeGreaterThan(50);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(canvas).toHaveAttribute('data-motion', 'static');
    if (scenario.weather_code >= 95)
      await expect(canvas).toHaveAttribute('data-lightning', 'static');
    // Let the camera finish before comparing static frames.
    let lastPitch = '',
      stableSince = Date.now();
    await expect
      .poll(async () => {
        const pitch = await page
          .getByTestId('parking-map')
          .getAttribute('data-map-pitch');
        if (pitch !== lastPitch) {
          lastPitch = pitch!;
          stableSince = Date.now();
        }
        return Date.now() - stableSince;
      })
      .toBeGreaterThan(500);
    const pixels = () =>
      canvas.evaluate((c) => (c as HTMLCanvasElement).toDataURL());
    const still = await pixels();
    await page.waitForTimeout(120);
    expect(await pixels()).toBe(still);
    expect(errors).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(scenario.width);
  });
}

test('heavy rain is visibly denser than drizzle', async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 844 });
  await fixture(page, 'wet', { rain: 0.025, snowfall: 0, weather_code: 51 });
  await enable(page);
  await expect(page.getByTestId('rain-layer-status')).toContainText(
    'Estimated drizzle',
  );
  const drizzle = Number(
    await page
      .getByTestId('rain-map-canvas')
      .getAttribute('data-rain-particles'),
  );
  expect(drizzle).toBeGreaterThan(0);
  const heavy = await context.newPage();
  await heavy.setViewportSize({ width: 1440, height: 844 });
  await fixture(heavy, 'wet', { rain: 3, snowfall: 0, weather_code: 65 });
  await enable(heavy);
  await expect(heavy.getByTestId('rain-layer-status')).toContainText(
    'Estimated heavy rain',
  );
  await expect
    .poll(async () =>
      Number(
        await heavy
          .getByTestId('rain-map-canvas')
          .getAttribute('data-rain-particles'),
      ),
    )
    .toBeGreaterThan(drizzle * 2);
});
