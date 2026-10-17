import { enableWindMap } from './wind-fixtures';
// Allow startup camera focus plus the deliberate forecast debounce.
import { expect as baseExpect, test } from '@playwright/test';
const expect = baseExpect.configure({ timeout: 10000 });
import { createWindTestRoutes } from '../test/fixtures/wind-routes';
import { readFileSync } from 'node:fs';
import { installOfflineMapFixture } from './offline-map-fixtures';
import {
  parseProviderWind,
  sampleProviderWind,
} from '../src/lib/provider-wind';
const capture = JSON.parse(
  readFileSync(
    new URL(
      '../src/lib/fixtures/ukv-edinburgh-2026-10-15.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
const now = new Date('2026-10-15T20:20:00Z');
const raw = capture.grid.slice(0, 20);
for (const width of [390, 1440]) {
  test(`provider field preserves actual samples, cache and source details at ${width}px`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.clock.install({ time: now });
    await installOfflineMapFixture(context);
    let requests = 0;
    await page.route('https://api.open-meteo.com/v1/forecast*', (r) => {
      requests++;
      expect(new URL(r.request().url()).searchParams.get('models')).toBe(
        'ukmo_uk_deterministic_2km',
      );
      return r.fulfill({ json: raw });
    });
    await page.goto('/');
    await page.getByTestId('map-layers-trigger').click();
    await page.getByTestId('wind-layer-toggle').check();
    await expect(page.locator('.wind-map-arrow').first()).toBeVisible();
    await expect(page.getByTestId('wind-overlay')).toContainText(
      'UKV ~2 km forecast',
    );
    await expect(page.getByTestId('wind-overlay')).toContainText(
      '4–6 km samples',
    );
    await expect(page.getByTestId('forecast-cells')).toHaveCount(0);
    const entries = await page.locator('.wind-map-arrow').evaluateAll((nodes) =>
      nodes.map((n) => {
        const d = (n as HTMLElement).dataset;
        return {
          point: [Number(d.longitude), Number(d.latitude)] as [number, number],
          speed: Number(d.speed),
          from: Number(d.from),
        };
      }),
    );
    expect(entries.length).toBeGreaterThan(0);
    const wind = parseProviderWind(raw, now.getTime(), now.getTime())!;
    for (const entry of entries) {
      const s = sampleProviderWind(wind.grid!, entry.point);
      expect(entry.speed).toBeCloseTo(s.speed, 6);
      expect(entry.from).toBeCloseTo(s.from, 6);
    }
    await page.getByTestId('wind-layer-toggle').uncheck();
    await page.getByTestId('wind-layer-toggle').check();
    await expect(page.locator('.wind-map-arrow').first()).toBeVisible();
    expect(requests).toBe(1);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
  });
}

test('grid failure uses a labelled area forecast, never invents a grid', async ({
  page,
  context,
}) => {
  await page.clock.setFixedTime(now);
  await installOfflineMapFixture(context);
  await page.route('https://api.open-meteo.com/v1/forecast*', (r) =>
    new URL(r.request().url()).searchParams.get('models') === 'ukmo_seamless'
      ? r.fulfill({ json: capture.baseline })
      : r.fulfill({ status: 503, body: 'no grid' }),
  );
  await page.goto('/');
  await page.getByTestId('map-layers-trigger').click();
  await page.getByTestId('wind-layer-toggle').check();
  await expect(page.getByTestId('wind-overlay')).toContainText(
    'Area forecast (grid unavailable)',
  );
  await expect(page.getByTestId('forecast-cells')).toHaveCount(0);
  const speeds = await page
    .locator('.wind-map-arrow')
    .evaluateAll((ns) => ns.map((n) => (n as HTMLElement).dataset.speed));
  expect(new Set(speeds)).toEqual(new Set(['2.6']));
});

test('cached grid retains capture time, advances aligned hours, expires and never retimes old data', async ({
  page,
  context,
}) => {
  await page.clock.install({ time: now });
  await installOfflineMapFixture(context);
  await page.addInitScript(
    ({ raw, stamp }) =>
      sessionStorage.setItem(
        'neuk-ukv-grid-v1',
        JSON.stringify({ value: raw, capturedAt: stamp }),
      ),
    { raw, stamp: Date.parse('2026-10-15T19:55:00Z') },
  );
  let requests = 0;
  await page.route('https://api.open-meteo.com/v1/forecast*', (r) => {
    requests++;
    return r.fulfill({ status: 503, body: 'unavailable' });
  });
  await page.goto('/');
  await page.getByTestId('map-layers-trigger').click();
  await page.getByTestId('wind-layer-toggle').check();
  await expect(page.getByTestId('wind-overlay')).toContainText('20:00 UTC');
  expect(requests).toBe(0);
  await page.clock.fastForward(40 * 60000);
  await expect(page.getByTestId('wind-overlay')).toContainText('21:00 UTC');
  await expect(page.getByTestId('wind-overlay')).toContainText('cached');
  expect(
    await page.evaluate(
      () => JSON.parse(sessionStorage.getItem('neuk-ukv-grid-v1')!).capturedAt,
    ),
  ).toBe(Date.parse('2026-10-15T19:55:00Z'));
  await page.clock.fastForward(60 * 60000);
  await expect(page.locator('.wind-map-arrow')).toHaveCount(0);
  await expect(page.getByTestId('map-layers-popover')).toContainText(
    /out of date|unavailable/i,
  );
});

test('provider field leaves the chosen route unchanged through forecast expiry', async ({
  page,
  context,
}) => {
  await page.clock.install({ time: now });
  await installOfflineMapFixture(context);
  const demo = createWindTestRoutes();
  const destination = demo.routes.balanced!.points.at(-1)!;
  await page.route('https://api.open-meteo.com/v1/forecast*', (r) =>
    r.fulfill({ json: raw }),
  );
  await page.route('https://photon.komoot.io/api/**', (r) =>
    r.fulfill({
      json: {
        features: [
          {
            geometry: { coordinates: [destination[1], destination[0]] },
            properties: {
              name: 'Provider wind destination',
              city: 'Edinburgh',
              country: 'United Kingdom',
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
      body: `${url.searchParams.get('callback')}(${JSON.stringify({ type: 'FeatureCollection', features: Object.values(demo.routes).map((route) => ({ type: 'Feature', properties: { path: `plan/${route.plan}`, plan: route.plan, lengthMetres: route.distanceMeters, timeSeconds: route.durationSeconds }, geometry: { type: 'LineString', coordinates: route.points.map(([lat, lng]) => [lng, lat]) } })) })});`,
    });
  });
  await page.goto('/?mockGps=55.9533,-3.1883,5');
  await expect(page.getByTestId('parking-list')).toBeVisible();
  await page
    .getByRole('button', { name: /^(Plan a route|Resume route)$/ })
    .click();
  await page
    .getByRole('combobox', { name: 'Search destination' })
    .fill('Provider');
  await page.getByRole('option').click();
  await expect(page.getByTestId('route-ascent-balanced')).toHaveCount(0);
  await enableWindMap(page);
  await expect(page.getByTestId('route-plan-balanced')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByTestId('wind-overlay')).toContainText('UKV ~2 km');
  await page.route('https://api.open-meteo.com/v1/forecast*', (r) =>
    r.fulfill({ status: 503, body: 'offline' }),
  );
  await page.clock.fastForward(40 * 60000);
  await expect(page.getByTestId('route-plan-balanced')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByTestId('wind-overlay')).toContainText('cached');
  await page.clock.fastForward(90 * 60000);
  await expect(page.getByTestId('wind-overlay')).toHaveCount(0);
  await expect(page.getByTestId('route-plan-balanced')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
