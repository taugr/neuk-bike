// Allow startup camera focus plus the deliberate forecast debounce.
import { expect as baseExpect, test, type Page } from '@playwright/test';
const expect = baseExpect.configure({ timeout: 10000 });
import { installOfflineMapFixture } from './offline-map-fixtures';
import { readFileSync } from 'node:fs';
import type CaptureType from '../src/lib/fixtures/regional-open-meteo-2026-10-16.json';
const captures: typeof CaptureType = JSON.parse(
  readFileSync(
    new URL(
      '../src/lib/fixtures/regional-open-meteo-2026-10-16.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
import { windRegion, parseRegionalWind } from '../src/lib/regional-wind';
import { sampleProviderWind } from '../src/lib/provider-wind';
const now = new Date('2026-10-16T16:50:00Z');
async function enable(page: Page) {
  await page.getByTestId('map-layers-trigger').click();
  await page.getByTestId('wind-layer-toggle').check();
}
for (const width of [390, 1440])
  test(`regional cells, sparse labels, units and same-region cache at ${width}px`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.clock.setFixedTime(now);
    await installOfflineMapFixture(context);
    const capture = captures.find((c) => c.provenance.name === 'Yerevan')!;
    let requests = 0;
    await page.route('https://api.open-meteo.com/v1/forecast*', (r) => {
      requests++;
      expect(new URL(r.request().url()).searchParams.get('models')).toBe(
        'best_match',
      );
      return r.fulfill({ json: capture.response });
    });
    await page.goto('/?lat=40.1777&lng=44.5126');
    await page.getByTestId('map-layers-trigger').click();
    await expect(page.getByTestId('wind-layer-status')).toHaveText(
      'Turn on to load forecast',
    );
    expect(requests).toBe(0);
    await page.getByTestId('wind-layer-toggle').check();
    await expect(page.getByTestId('wind-layer-status')).toContainText(
      'Regional forecast',
    );
    await expect(page.locator('.wind-map-arrow').first()).toBeVisible();
    await expect(page.getByTestId('wind-overlay')).toHaveClass('sr-only');
    await expect(page.locator('.wind-map-caption')).toHaveCount(0);
    await expect(page.getByTestId('forecast-cells')).toHaveCount(0);
    const region = windRegion({
      west: 44.5,
      east: 44.53,
      south: 40.16,
      north: 40.19,
    })!;
    const wind = parseRegionalWind(
      capture.response,
      region,
      now.getTime(),
      now.getTime(),
    )!;
    const arrows = await page
      .locator('.wind-map-arrow')
      .evaluateAll((ns) => ns.map((n) => ({ ...(n as HTMLElement).dataset })));
    expect(arrows.length).toBeGreaterThan(0);
    for (const a of arrows) {
      const sample = sampleProviderWind(wind.grid!, [
        Number(a.longitude),
        Number(a.latitude),
      ]);
      expect(Number(a.speed)).toBeCloseTo(sample.speed, 6);
      expect(Number(a.from)).toBeCloseTo(sample.from, 6);
    }
    await page.getByTestId('wind-layer-toggle').uncheck();
    await page.getByTestId('wind-layer-toggle').check();
    await expect(page.getByTestId('wind-layer-status')).toHaveAttribute(
      'data-state',
      'available',
    );
    expect(requests).toBe(1);
    await page.getByTestId('map-layers-trigger').click();
    await page
      .getByRole('button', { name: /^(Bike Neuk menu|Theme settings)$/ })
      .click();
    await page
      .getByRole('combobox', { name: 'Units', exact: true })
      .selectOption('imperial');
    await expect(page.locator('.wind-map-speed').first()).toContainText('mph');
    await page.keyboard.press('Escape');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
  });

test('new region cannot reuse Edinburgh or another city; saved region survives reload', async ({
  page,
  context,
}) => {
  await installOfflineMapFixture(context);
  await page.clock.setFixedTime(now);
  let requests = 0;
  await page.route('https://api.open-meteo.com/v1/forecast*', (r) => {
    requests++;
    const q = new URL(r.request().url()).searchParams;
    const lng = Number(q.get('longitude')!.split(',')[0]);
    const capture = captures.find(
      (c) => c.provenance.name === (lng > 40 ? 'Yerevan' : 'Madrid'),
    )!;
    return r.fulfill({ json: capture.response });
  });
  await page.goto('/?lat=40.1777&lng=44.5126');
  await enable(page);
  await expect(page.locator('.wind-map-arrow').first()).toBeVisible();
  await page.clock.setFixedTime(new Date(now.getTime() + 20000));
  await page.goto('/?lat=40.4168&lng=-3.7038');
  await page.clock.setFixedTime(new Date(now.getTime() + 20000));
  await enable(page);
  await expect(page.locator('.wind-map-arrow').first()).toBeVisible();
  expect(
    await page
      .locator('.wind-map-arrow')
      .first()
      .getAttribute('data-longitude'),
  ).toMatch(/^-/);
  expect(requests).toBe(2);
  await page.goto('/?lat=40.1777&lng=44.5126');
  await enable(page);
  await expect(page.locator('.wind-map-arrow').first()).toBeVisible();
  expect(requests).toBe(2);
});

test('failed regional request has no Edinburgh fallback; cancelled request cannot repaint', async ({
  page,
  context,
}) => {
  await installOfflineMapFixture(context);
  let requests = 0;
  await page.route('https://api.open-meteo.com/v1/forecast*', (r) => {
    requests++;
    return r.fulfill({ status: 503 });
  });
  await page.goto('/?lat=40.1777&lng=44.5126');
  await enable(page);
  await expect.poll(() => requests).toBe(1);
  await expect(page.getByTestId('wind-layer-status')).toHaveAttribute(
    'data-state',
    'error',
  );
  expect(requests).toBe(1);
  await expect(page.locator('.wind-map-arrow')).toHaveCount(0);
  await page.getByTestId('wind-layer-toggle').uncheck();
  await page.getByTestId('wind-layer-toggle').check();
  await page.getByTestId('wind-layer-toggle').uncheck();
  await expect(page.getByTestId('wind-layer-status')).toHaveAttribute(
    'data-state',
    'idle',
  );
  await page.waitForTimeout(1000);
  expect(requests).toBe(1);
});

test('regional cache advances hour, remains dated during outage and expires', async ({
  page,
  context,
}) => {
  await page.clock.install({ time: now });
  await installOfflineMapFixture(context);
  const region = windRegion({
    west: 44.5,
    east: 44.53,
    south: 40.16,
    north: 40.19,
  })!;
  const capture = captures.find((c) => c.provenance.name === 'Yerevan')!;
  const response = capture.response.map((v) => ({
    ...v,
    hourly: {
      time: ['2026-10-16T16:00', '2026-10-16T17:00', '2026-10-16T18:00'],
      wind_speed_10m: [2, 3, 4],
      wind_direction_10m: [180, 190, 200],
    },
  }));
  await page.addInitScript(
    ({ key, value, stamp }) =>
      sessionStorage.setItem(
        'neuk-regional-wind-v1',
        JSON.stringify([
          { key, value, capturedAt: stamp, hour: Math.floor(stamp / 3600000) },
        ]),
      ),
    { key: region.key, value: response, stamp: now.getTime() },
  );
  let requests = 0;
  await page.route('https://api.open-meteo.com/v1/forecast*', (r) => {
    requests++;
    return r.fulfill({ status: 503 });
  });
  await page.goto('/?lat=40.1777&lng=44.5126');
  await enable(page);
  await expect(page.getByTestId('wind-layer-status')).toContainText(
    '16:00 UTC',
  );
  expect(requests).toBe(0);
  await page.clock.fastForward(40 * 60000);
  await expect(page.getByTestId('wind-layer-status')).toContainText(
    '17:00 UTC · cached',
  );
  expect(
    await page.evaluate(
      () =>
        JSON.parse(sessionStorage.getItem('neuk-regional-wind-v1')!)[0]
          .capturedAt,
    ),
  ).toBe(now.getTime());
  await page.clock.fastForward(90 * 60000);
  await expect(page.locator('.wind-map-arrow')).toHaveCount(0);
  await expect(page.getByTestId('wind-layer-status')).toHaveText(
    /out of date|unavailable/i,
  );
});

test('regional wind map leaves route style unchanged', async ({
  page,
  context,
}) => {
  await page.clock.setFixedTime(now);
  await installOfflineMapFixture(context);
  const coordinate = (forward: number, side = 0) => {
    const a = (194 * Math.PI) / 180;
    const x = forward * Math.sin(a) + side * Math.cos(a),
      y = forward * Math.cos(a) - side * Math.sin(a);
    return [
      44.5126 + x / (111194.9266 * Math.cos((40.1777 * Math.PI) / 180)),
      40.1777 + y / 111194.9266,
    ];
  };
  await page.route('https://api.open-meteo.com/v1/forecast*', (r) => {
    const query = new URL(r.request().url()).searchParams;
    expect(query.get('models')).toBe('best_match');
    const latitudes = query.get('latitude')!.split(',').map(Number),
      longitudes = query.get('longitude')!.split(',').map(Number);
    return r.fulfill({
      json: latitudes.map((latitude, i) => ({
        latitude,
        longitude: longitudes[i],
        utc_offset_seconds: 0,
        hourly_units: { wind_speed_10m: 'm/s', wind_direction_10m: '°' },
        hourly: {
          time: ['2026-10-16T16:00'],
          wind_speed_10m: [4.4],
          wind_direction_10m: [194],
        },
      })),
    });
  });
  await page.route('https://photon.komoot.io/api/**', (r) =>
    r.fulfill({
      json: {
        features: [
          {
            geometry: { coordinates: coordinate(1000) },
            properties: {
              name: 'Regional route destination',
              city: 'Yerevan',
              country: 'Armenia',
              osm_id: 123,
              osm_type: 'N',
            },
          },
        ],
      },
    }),
  );
  await page.route('https://api.cyclestreets.net/v2/journey.plan*', (r) => {
    const url = new URL(r.request().url());
    return r.fulfill({
      contentType: 'application/javascript',
      body: `${url.searchParams.get('callback')}(${JSON.stringify({ type: 'FeatureCollection', features: ['quietest', 'balanced', 'fastest'].map((plan) => ({ type: 'Feature', properties: { path: `plan/${plan}`, plan, lengthMetres: plan === 'quietest' ? 1077 : 1000, timeSeconds: plan === 'quietest' ? 1050 : 1000 }, geometry: { type: 'LineString', coordinates: plan === 'quietest' ? [coordinate(0), coordinate(500, 200), coordinate(1000)] : [coordinate(0), coordinate(1000)] } })) })});`,
    });
  });
  await page.goto('/?mockGps=40.1777,44.5126,5');
  await expect(page.getByTestId('parking-list')).toBeVisible();
  await page
    .getByRole('button', { name: /^(Plan a route|Resume route)$/ })
    .click();
  await page
    .getByRole('combobox', { name: 'Search destination' })
    .fill('Regional');
  await page.getByRole('option').click();
  await page.getByTestId('map-layers-trigger').click();
  await page.getByTestId('wind-layer-toggle').check();
  await expect(page.getByTestId('wind-overlay')).toContainText(
    'Regional forecast',
  );
  await expect(page.getByTestId('route-plan-balanced')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByTestId('wind-layer-toggle').uncheck();
  await expect(page.locator('.wind-map-arrow')).toHaveCount(0);
  await expect(page.getByTestId('route-plan-balanced')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('429 retry deadline survives reload and never tries Edinburgh', async ({
  page,
  context,
}) => {
  await page.clock.setFixedTime(now);
  await installOfflineMapFixture(context);
  let requests = 0;
  await page.route('https://api.open-meteo.com/v1/forecast*', (r) => {
    requests++;
    expect(new URL(r.request().url()).searchParams.get('models')).toBe(
      'best_match',
    );
    return r.fulfill({ status: 429, headers: { 'retry-after': '3600' } });
  });
  await page.goto('/?lat=40.1777&lng=44.5126');
  await enable(page);
  await expect.poll(() => requests).toBe(1);
  await expect(page.getByTestId('wind-layer-status')).toHaveAttribute(
    'data-state',
    'error',
  );
  await page.reload();
  await page.clock.setFixedTime(new Date(now.getTime() + 20000));
  await enable(page);
  await expect(page.getByTestId('wind-layer-status')).toHaveAttribute(
    'data-state',
    'error',
  );
  expect(requests).toBe(1);
});

test('an in-flight regional response is discarded after disabling; small pans reuse the tile', async ({
  page,
  context,
}) => {
  await page.clock.setFixedTime(now);
  await installOfflineMapFixture(context);
  const capture = captures.find((c) => c.provenance.name === 'Yerevan')!;
  let requests = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('https://api.open-meteo.com/v1/forecast*', async (r) => {
    requests++;
    if (requests === 1) await gate;
    await r.fulfill({ json: capture.response });
  });
  await page.goto('/?lat=40.1777&lng=44.5126');
  await enable(page);
  await expect.poll(() => requests).toBe(1);
  await page.getByTestId('wind-layer-toggle').uncheck();
  release();
  await expect(page.getByTestId('wind-layer-status')).toHaveAttribute(
    'data-state',
    'idle',
  );
  await expect(page.locator('.wind-map-arrow')).toHaveCount(0);
  await page.clock.setFixedTime(new Date(now.getTime() + 20000));
  await page.getByTestId('wind-layer-toggle').check();
  await expect(page.locator('.wind-map-arrow').first()).toBeVisible();
  expect(requests).toBe(2);
  await page.getByTestId('map-layers-trigger').click();
  await expect(page.getByTestId('map-layers-popover')).toHaveCount(0);
  const canvas = (await page.locator('.maplibregl-canvas').boundingBox())!;
  const before = await page
    .getByTestId('parking-map')
    .getAttribute('data-map-center-longitude');
  await page.mouse.move(canvas.x + canvas.width / 3, canvas.y + 250);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width / 3 + 80, canvas.y + 280, {
    steps: 20,
  });
  await page.mouse.up();
  await expect(page.getByTestId('parking-map')).not.toHaveAttribute(
    'data-map-center-longitude',
    before!,
  );
  // Observe past both camera settling and request debounce; no new request is due.
  await page.waitForTimeout(1800);
  expect(requests).toBe(2);
  await expect(page.locator('.wind-map-arrow').first()).toBeVisible();
});
