import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { devices, expect, test, type Page } from '@playwright/test';
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

test.describe('map diagnostics', () => {
  test.use({
    userAgent: devices['iPhone 13'].userAgent,
    reducedMotion: 'reduce',
  });

  const terrainTiles = 'https://elevation-tiles-prod.s3.amazonaws.com/**';
  const terrainFixture = fileURLToPath(
    new URL('../e2e/fixtures/terrain.png', import.meta.url),
  );
  const appUrl =
    '/?mockGps=55.9533,-3.1883,5&analyticsTest=1&utm_content=55.9533,-3.1883#private-fragment';

  function expectPrivateDiagnostic(event: Event) {
    expect(event.properties).toMatchObject({
      app: 'neuk-bike',
      analytics_schema_version: 2,
      is_test: true,
      $device: 'iPhone',
      $os: 'iOS',
      $raw_user_agent: devices['iPhone 13'].userAgent,
    });
    expect(JSON.stringify(event)).not.toMatch(
      /55\.9533|-3\.1883|mockGps|private-fragment|utm_content|\$current_url|\$referrer|elevation-tiles-prod/,
    );
  }

  test('reports bounded page errors once per kind', async ({ page }) => {
    const events = await recordEvents(page);
    await page.goto(appUrl);
    await expect(page.getByTestId('parking-map')).toHaveAttribute(
      'data-map-initializing',
      'false',
    );
    await page.evaluate(() => {
      for (let index = 0; index < 2; index++) {
        setTimeout(() => {
          throw new Error('https://example.com/?lat=55.9533');
        }, 0);
        setTimeout(() => {
          void Promise.reject(new Error('https://example.com/?lng=-3.1883'));
        }, 0);
      }
    });
    const errors = () =>
      events.filter(({ event }) => event === 'map_page_error');
    await expect.poll(() => errors().length).toBe(2);
    expect(
      errors()
        .map(({ properties }) => properties.reason)
        .sort(),
    ).toEqual(['runtime_error', 'unhandled_rejection']);
    for (const error of errors()) {
      expect(error.properties).toMatchObject({
        map_phase: 'ready',
        terrain_active: false,
      });
      expect(JSON.stringify(error)).not.toContain('example.com');
      expectPrivateDiagnostic(error);
    }
  });

  test('reports a foreground startup stall only once', async ({ page }) => {
    const events = await recordEvents(page);
    let releaseStyle: () => void = () => {};
    const styleReady = new Promise<void>((resolve) => {
      releaseStyle = resolve;
    });
    const requestedStyle = page.waitForRequest(
      'https://tiles.openfreemap.org/styles/liberty',
    );
    await page.route(
      'https://tiles.openfreemap.org/styles/liberty',
      async (route) => {
        await styleReady;
        await route.fallback();
      },
    );
    try {
      await page.clock.install();
      await page.goto(appUrl);
      await requestedStyle;
      await page.clock.fastForward(21_000);
      const stalls = () =>
        events.filter(({ event }) => event === 'map_render_stalled');
      await expect.poll(() => stalls().length).toBe(1);
      await page.clock.fastForward(21_000);
      expect(stalls()).toHaveLength(1);
      expect(stalls()[0]!.properties).toMatchObject({
        map_phase: 'starting',
        terrain_active: false,
      });
      expectPrivateDiagnostic(stalls()[0]!);
    } finally {
      releaseStyle();
    }
  });

  test('reports a recent unfinished reload without counting a clean reload', async ({
    page,
  }) => {
    const events = await recordEvents(page);
    await page.goto(appUrl);
    await expect(page.getByTestId('parking-map')).toHaveAttribute(
      'data-map-initializing',
      'false',
    );
    await page.evaluate(() => {
      // Restore the previous foreground marker after the app's clean-exit listener.
      window.addEventListener(
        'pagehide',
        () => {
          sessionStorage.setItem(
            'bike-neuk-map-diagnostics-v1',
            JSON.stringify({
              checkedAt: Date.now(),
              isTest: true,
              map_phase: 'recovering',
              terrain_active: true,
              coordinates: [55.9533, -3.1883],
            }),
          );
        },
        { once: true },
      );
    });
    await page.reload();
    const interruptions = () =>
      events.filter(({ event }) => event === 'map_session_interrupted');
    await expect.poll(() => interruptions().length).toBe(1);
    expect(interruptions()[0]!.properties).toMatchObject({
      reason: 'unclean_reload',
      map_phase: 'recovering',
      terrain_active: true,
    });
    expectPrivateDiagnostic(interruptions()[0]!);
    await expect(page.getByTestId('parking-map')).toHaveAttribute(
      'data-map-initializing',
      'false',
    );
    await page.reload();
    await expect
      .poll(() => events.filter(({ event }) => event === '$pageview').length, {
        timeout: 15_000,
      })
      .toBe(3);
    expect(interruptions()).toHaveLength(1);
  });

  test('reports one terrain failure and allows a successful retry', async ({
    page,
  }) => {
    const events = await recordEvents(page);
    await page.route(terrainTiles, (route) => route.abort());
    await page.goto(appUrl);
    await page.getByRole('button', { name: 'Switch to 3D map' }).click();
    await expect(
      page.getByText('3D terrain unavailable.', { exact: false }),
    ).toBeVisible();
    const failures = () =>
      events.filter(({ event }) => event === 'map_terrain_failed');
    await expect.poll(() => failures().length, { timeout: 15_000 }).toBe(1);
    const failure = failures()[0]!;
    expect(failure.properties).toMatchObject({
      reason: 'tile_error',
      terrain_source: 'global',
      terrain_ready: false,
    });
    expectPrivateDiagnostic(failure);

    await page.unroute(terrainTiles);
    await page.route(terrainTiles, (route) =>
      route.fulfill({ contentType: 'image/png', path: terrainFixture }),
    );
    await page.getByRole('button', { name: 'Switch to 3D map' }).click();
    const map = page.getByTestId('parking-map');
    await expect(map).toHaveAttribute('data-map-terrain', 'neuk-terrain');
    await expect
      .poll(async () => Number(await map.getAttribute('data-map-pitch')), {
        timeout: 15_000,
      })
      .toBeCloseTo(55, 0);
    expect(failures()).toHaveLength(1);
  });

  test('reports WebGL loss and restoration while 3D terrain is active', async ({
    page,
  }) => {
    const events = await recordEvents(page);
    await page.route(terrainTiles, (route) =>
      route.fulfill({ contentType: 'image/png', path: terrainFixture }),
    );
    await page.goto(appUrl);
    await page.getByRole('button', { name: 'Switch to 3D map' }).click();
    const map = page.getByTestId('parking-map');
    await expect(map).toHaveAttribute('data-map-terrain', 'neuk-terrain');
    await page.locator('.maplibregl-canvas').evaluate(async (element) => {
      const canvas = element as HTMLCanvasElement;
      const extension = canvas
        .getContext('webgl2')!
        .getExtension('WEBGL_lose_context')!;
      await new Promise<void>((resolve) => {
        canvas.addEventListener('webglcontextlost', () => resolve(), {
          once: true,
        });
        extension.loseContext();
      });
      // The loss event must finish dispatching before restoration is allowed.
      await new Promise((resolve) => setTimeout(resolve, 100));
      await new Promise<void>((resolve) => {
        canvas.addEventListener('webglcontextrestored', () => resolve(), {
          once: true,
        });
        extension.restoreContext();
      });
    });
    const changes = () =>
      events.filter(({ event }) => event === 'map_webgl_context_changed');
    await expect.poll(() => changes().length, { timeout: 15_000 }).toBe(2);
    expect(changes().map(({ properties }) => properties.context_state)).toEqual(
      ['lost', 'restored'],
    );
    for (const change of changes()) {
      expect(change.properties.terrain_active).toBe(true);
      expectPrivateDiagnostic(change);
    }
    await expect(map).toHaveAttribute('data-map-terrain', 'neuk-terrain');
    await expect(page.locator('.parking-marker').first()).toBeVisible();
  });
});

test('records explicit weather and wind switches without counting restored preferences', async ({
  page,
}) => {
  const events = await recordEvents(page);
  await page.addInitScript(() => {
    localStorage.setItem('bike-neuk-map-rain', 'true');
  });
  await page.route('https://api.open-meteo.com/**', (route) =>
    route.fulfill({ status: 503, body: 'Unavailable in this analytics test' }),
  );
  await page.goto('/?mockGps=55.9533,-3.1883,5&analyticsTest=1');
  await expect(page.getByTestId('parking-list')).toBeVisible();
  await page.getByTestId('map-layers-trigger').click();
  const weather = page.getByTestId('rain-layer-toggle');
  const wind = page.getByTestId('wind-layer-toggle');
  await expect(weather).toBeChecked();
  await weather.uncheck();
  await weather.check();
  await wind.check();
  await wind.uncheck();
  const changes = () =>
    events.filter(({ event }) => event === 'map_layer_changed');
  await expect.poll(() => changes().length, { timeout: 15_000 }).toBe(4);
  await page.reload();
  await expect(page.getByTestId('parking-list')).toBeVisible();
  await page.getByTestId('map-layers-trigger').click();
  await expect(weather).toBeChecked();
  await expect
    .poll(() => events.filter(({ event }) => event === '$pageview').length, {
      timeout: 15_000,
    })
    .toBe(2);
  expect(
    changes().map(({ properties: { layer, visible } }) => ({ layer, visible })),
  ).toEqual([
    { layer: 'weather', visible: false },
    { layer: 'weather', visible: true },
    { layer: 'wind', visible: true },
    { layer: 'wind', visible: false },
  ]);
  for (const { properties } of changes()) {
    expect(properties).toMatchObject({
      app: 'neuk-bike',
      analytics_schema_version: 2,
      is_test: true,
    });
    expect(JSON.stringify(properties)).not.toMatch(
      /mockGps=|55\.9533|latitude|longitude/,
    );
  }
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

for (const outcome of ['shared', 'copied', 'cancelled', 'failed'] as const) {
  test(`parking sharing records only successful ${outcome} outcomes`, async ({
    page,
  }) => {
    const events = await recordEvents(page);
    await page.addInitScript((result) => {
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value:
          result === 'copied' || result === 'failed'
            ? undefined
            : async () => {
                if (result === 'cancelled')
                  throw new DOMException('Cancelled', 'AbortError');
              },
      });
      Object.defineProperty(document, 'execCommand', {
        configurable: true,
        value: () => result === 'copied',
      });
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async () => {
            throw new Error('Unavailable');
          },
        },
      });
    }, outcome);
    await page.goto('/?analyticsTest=1&parking=1');
    const share = page
      .getByRole('button', { name: /^Share Gylemuir Road/ })
      .first();
    await share.click();
    // Flush the same SDK batch via a subsequent UI event before testing absence.
    await page
      .getByRole('button', { name: 'Plan a route', exact: true })
      .click();
    await expect
      .poll(
        () => events.some(({ event }) => event === 'route_planner_opened'),
        { timeout: 15_000 },
      )
      .toBe(true);
    const shares = events.filter(
      ({ event }) =>
        event === 'parking_link_shared' || event === 'parking_link_copied',
    );
    if (outcome === 'shared' || outcome === 'copied') {
      expect(shares).toHaveLength(1);
      expect(shares[0]!.event).toBe(`parking_link_${outcome}`);
      expect(shares[0]!.properties).toMatchObject({
        is_test: true,
        analytics_schema_version: 2,
      });
      expect(JSON.stringify(shares[0]!.properties)).not.toMatch(
        /Gylemuir|parking=|55\.940/,
      );
    } else {
      expect(shares).toHaveLength(0);
    }
  });
}

test('saving and sharing a route records completed outcomes without private route data', async ({
  page,
}) => {
  const events = await recordEvents(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: undefined,
    });
  });
  await page.goto('/?analyticsTest=1&mockGps=55.9533,-3.1883,5');
  await page.getByRole('button', { name: 'Plan a route', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Search destination' })
    .fill('Private');
  await page.getByRole('option').click();
  await page.getByRole('button', { name: 'Save route', exact: true }).click();
  const detail = page.locator('.saved-route-detail');
  await expect(detail).toBeVisible();
  await detail
    .getByRole('button', { name: 'Share route', exact: true })
    .click();
  await detail.getByRole('button', { name: /Share route link/ }).click();
  await detail.getByRole('button', { name: /Share GPX file/ }).click();
  await expect
    .poll(
      () =>
        events.filter(({ event }) =>
          ['route_saved', 'route_link_shared', 'route_gpx_shared'].includes(
            event,
          ),
        ).length,
      { timeout: 15_000 },
    )
    .toBe(3);
  const saved = events.find(({ event }) => event === 'route_saved')!;
  const linked = events.find(({ event }) => event === 'route_link_shared')!;
  const gpx = events.find(({ event }) => event === 'route_gpx_shared')!;
  expect(linked.properties.method).toBe('copied');
  expect(gpx.properties.method).toBe('downloaded');
  expect(linked.properties.journey_id).toBe(saved.properties.journey_id);
  for (const event of [saved, linked, gpx]) {
    expect(event.properties).toMatchObject({
      is_test: true,
      analytics_schema_version: 2,
    });
    expect(JSON.stringify(event.properties)).not.toMatch(
      /Private test destination|mockGps=|55\.9533|route=/,
    );
  }
});
