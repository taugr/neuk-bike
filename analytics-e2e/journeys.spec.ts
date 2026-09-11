import { gunzipSync } from 'node:zlib';
import { expect, test, type Page } from '@playwright/test';
import { installOfflineMapFixture } from '../e2e/offline-map-fixtures';

type Event = { event: string; properties: Record<string, unknown> };
async function recordEvents(page: Page) {
  const events: Event[] = [];
  // Chromium's headless client-hint brand is correctly filtered as bot traffic
  // by PostHog. Model an ordinary browser only inside this intercepted fixture.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgentData', { value: undefined });
    Object.defineProperty(navigator, 'webdriver', { value: false });
  });
  await page.route('https://analytics.neuk.test/**', async (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.pathname.endsWith('.js')) {
      await route.fulfill({
        contentType: 'application/javascript',
        body: `window._POSTHOG_REMOTE_CONFIG = { phc_neuk_analytics_test: { config: { hasFeatureFlags: false, supportedCompression: [] } } };`,
      });
      return;
    }
    const body = route.request().postDataBuffer();
    if (
      body &&
      /\/(e|capture)\/?$/.test(new URL(route.request().url()).pathname)
    ) {
      let decoded: string;
      if (body[0] === 0x1f && body[1] === 0x8b)
        decoded = gunzipSync(body).toString();
      else {
        const text = body.toString();
        const encoded = new URLSearchParams(text).get('data');
        decoded = encoded ? Buffer.from(encoded, 'base64').toString() : text;
      }
      const value = JSON.parse(decoded);
      events.push(...(Array.isArray(value) ? value : (value.batch ?? [value])));
    }
    await route.fulfill({
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': '*',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
      },
      json: { status: 1, featureFlags: {}, supportedCompression: [] },
    });
  });
  return events;
}

async function mockRouteServices(page: Page) {
  await page.route('https://photon.komoot.io/api/**', (route) =>
    route.fulfill({
      json: {
        features: [
          {
            geometry: { coordinates: [-3.189, 55.947] },
            properties: {
              name: 'Private test destination',
              country: 'United Kingdom',
              city: 'Edinburgh',
              osm_id: 2,
              osm_type: 'N',
            },
          },
        ],
      },
    }),
  );
  await page.route('https://api.cyclestreets.net/v2/journey.plan*', (route) => {
    const url = new URL(route.request().url());
    const coordinates = (url.searchParams.get('waypoints') ?? '')
      .split('|')
      .map((point) => point.split(',').slice(0, 2).map(Number));
    return route.fulfill({
      contentType: 'application/javascript',
      body: `${url.searchParams.get('callback')}(${JSON.stringify({ type: 'FeatureCollection', features: ['quietest', 'balanced', 'fastest'].map((plan) => ({ type: 'Feature', properties: { path: `plan/${plan}`, plan, lengthMetres: 1200, timeSeconds: 420 }, geometry: { type: 'LineString', coordinates } })) })});`,
    });
  });
}

test.beforeEach(async ({ context, page }) => {
  await installOfflineMapFixture(context);
  await mockRouteServices(page);
});

test('pairs automatic location and API/cache results without leaking destinations', async ({
  page,
}) => {
  const events = await recordEvents(page);
  await page.goto('/?mockGps=55.9533,-3.1883,5#private-fragment');
  await expect(page.getByTestId('parking-list')).toBeVisible();
  await page.getByRole('button', { name: 'Plan a route', exact: true }).click();
  const destination = page.getByRole('combobox', {
    name: 'Search destination',
  });
  await destination.fill('Private');
  await page.getByRole('option').click();
  const journey = page.getByTestId('route-journey');
  await expect(
    journey.getByRole('button', { name: 'Start route', exact: true }),
  ).toBeVisible();
  await expect
    .poll(
      () => events.filter((event) => event.event === 'route_calculated').length,
      { timeout: 15_000 },
    )
    .toBe(1);
  expect(
    events.find((event) => event.event === 'route_calculated')?.properties
      .result_source,
  ).toBe('api');
  await journey.getByTestId('journey-destination').click();
  await destination.fill('Private');
  await page.getByRole('option').click();
  await expect
    .poll(
      () => events.filter((event) => event.event === 'route_calculated').length,
      { timeout: 15_000 },
    )
    .toBe(2);
  expect(
    events.filter((event) => event.event === 'route_calculated')[1]!.properties
      .result_source,
  ).toBe('cache');
  const requested = events.find(
    (event) => event.event === 'location_requested',
  );
  expect(requested?.properties).toMatchObject({
    trigger: 'automatic',
    purpose: 'finder',
  });
  expect(
    events.filter(
      (event) =>
        event.event === 'location_resolved' &&
        event.properties.attempt_id === requested?.properties.attempt_id,
    ),
  ).toHaveLength(1);
  const journeyIds = new Set(
    events
      .filter((event) =>
        [
          'route_planner_opened',
          'route_destination_selected',
          'route_calculated',
        ].includes(event.event),
      )
      .map((event) => event.properties.journey_id),
  );
  expect(journeyIds.size).toBe(1);
  expect(journeyIds.has(undefined)).toBe(false);
  for (const event of events) {
    expect(JSON.stringify(event.properties)).not.toMatch(
      /Private test destination|private-fragment|mockGps=|parking=|55\.9533|cec:1/,
    );
  }
});

test('counts parking entry and short routes, then only one ride start and arrival', async ({
  page,
}) => {
  const events = await recordEvents(page);
  await page.goto(
    '/?mockGps=55.9406042783081,-3.29451047885751,5&lat=55.9406042783081&lng=-3.29451047885751&parking=1',
  );
  await expect(page.getByTestId('parking-list')).toBeVisible();
  // A shared parking link opens the selection; the normal action enters the planner.
  await page
    .getByRole('button', { name: 'Directions', exact: true })
    .first()
    .click();
  await page
    .getByRole('region', { name: 'Choose a starting point', exact: true })
    .getByRole('button', { name: 'Use my location', exact: true })
    .click();
  await expect(page.getByTestId('route-journey')).toBeVisible();
  await expect
    .poll(
      () => events.filter((event) => event.event === 'route_calculated').length,
      { timeout: 15_000 },
    )
    .toBe(1);
  expect(
    events.find((event) => event.event === 'route_planner_opened')?.properties
      .source,
  ).toBe('parking');
  expect(
    events.find((event) => event.event === 'route_calculated')?.properties
      .result_source,
  ).toBe('short_route');
  await page.getByRole('button', { name: 'Start route', exact: true }).click();
  await expect
    .poll(
      () => events.filter((event) => event.event === 'ride_completed').length,
      { timeout: 15_000 },
    )
    .toBe(1);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect
    .poll(
      () => events.filter((event) => event.event === 'ride_stopped').length,
      { timeout: 15_000 },
    )
    .toBe(1);
  expect(events.filter((event) => event.event === 'ride_started')).toHaveLength(
    1,
  );
  expect(
    events.find((event) => event.event === 'ride_stopped')?.properties,
  ).toMatchObject({ reason: 'user', arrived: true });
});

test('separates manual permission denial from automatic startup', async ({
  page,
}) => {
  const events = await recordEvents(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator.permissions, 'query', {
      value: async () => ({ state: 'denied' }),
    });
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: (
          _success: unknown,
          fail: (error: unknown) => void,
        ) => fail({ code: 1, PERMISSION_DENIED: 1 }),
      },
    });
  });
  await page.goto('/?analyticsTest=1');
  await expect(page.getByTestId('parking-list')).toBeVisible();
  await page
    .getByRole('button', { name: 'Use current location', exact: true })
    .click();
  await expect
    .poll(
      () =>
        events.filter((event) => event.event === 'location_resolved').length,
      { timeout: 15_000 },
    )
    .toBe(1);
  expect(
    events.filter((event) => event.event === 'location_requested'),
  ).toHaveLength(1);
  expect(
    events.find((event) => event.event === 'location_requested')?.properties,
  ).toMatchObject({ trigger: 'manual', purpose: 'finder' });
  expect(
    events.find((event) => event.event === 'location_requested')?.properties
      .is_test,
  ).toBe(true);
  expect(
    events.find((event) => event.event === 'location_resolved')?.properties
      .outcome,
  ).toBe('denied');
});
