import { expect, test } from '@playwright/test';
import { installOfflineMapFixture } from './offline-map-fixtures';

test.beforeEach(async ({ context, page }) => {
  await installOfflineMapFixture(context);
  await page.route('https://photon.komoot.io/api/**', async (route) => {
    const query = new URL(route.request().url()).searchParams.get('q') ?? '';
    await route.fulfill({
      json: {
        features: [
          {
            geometry: {
              coordinates:
                query === 'Home'
                  ? [-3.2, 55.96]
                  : query === 'Meadows'
                    ? [-3.195, 55.941]
                    : [-3.189, 55.947],
            },
            properties: {
              name:
                query === 'Home'
                  ? 'Home'
                  : query === 'Meadows'
                    ? 'Meadows'
                    : 'National Museum of Scotland',
              country: 'United Kingdom',
              city: 'Edinburgh',
              osm_id: query === 'Home' ? 1 : query === 'Meadows' ? 3 : 2,
              osm_type: 'N',
            },
          },
        ],
      },
    });
  });
  await page.route(
    'https://api.cyclestreets.net/v2/journey.plan*',
    async (route) => {
      const url = new URL(route.request().url());
      const coordinates = (url.searchParams.get('waypoints') ?? '')
        .split('|')
        .map((point) => point.split(',').slice(0, 2).map(Number));
      await route.fulfill({
        contentType: 'application/javascript',
        body: `${url.searchParams.get('callback')}(${JSON.stringify({ type: 'FeatureCollection', features: ['quietest', 'balanced', 'fastest'].map((plan, index) => ({ type: 'Feature', properties: { path: `plan/${plan}`, plan, lengthMetres: 1200 + index * 100, timeSeconds: 420 - index * 60 }, geometry: { type: 'LineString', coordinates } })) })});`,
      });
    },
  );
});

for (const width of [390, 1440]) {
  test(`destination-first preview, edit, and resume at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/?mockGps=55.9533,-3.1883,5');
    await expect(page.getByTestId('parking-list')).toBeVisible();
    await page
      .getByRole('button', { name: /^(Plan a route|Resume route)$/ })
      .click();
    await expect(page.getByTestId('route-map-editor')).toHaveCount(0);
    await page
      .getByRole('combobox', { name: 'Search destination' })
      .fill('Museum');
    await page.getByRole('option').click();
    const journey = page.getByTestId('route-journey');
    await expect(journey.getByTestId('journey-start')).toContainText(
      'Current location',
    );
    await expect(journey.getByTestId('journey-destination')).toContainText(
      'National Museum',
    );
    await expect(
      journey.getByRole('button', { name: 'Start route', exact: true }),
    ).toBeVisible();
    await journey.getByTestId('route-plan-quietest').click();
    await expect(journey.getByTestId('route-plan-quietest')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await journey
      .getByRole('button', { name: 'Edit route', exact: true })
      .click();
    const planner = page.locator('.route-planner');
    await expect(planner.locator('.route-stop-row')).toHaveCount(2);
    await planner.getByRole('button', { name: 'Add stop on map' }).click();
    await expect(page.getByTestId('route-map-editor')).toBeVisible();
    await page
      .getByTestId('route-map-editor')
      .getByRole('button', { name: 'Cancel' })
      .click();
    await planner.getByRole('button', { name: 'Back', exact: true }).click();
    await journey.getByRole('button', { name: 'Back to nearby neuks' }).click();
    await expect(page.getByTestId('parking-list')).toBeVisible();
    await expect(
      page.getByRole('button', { name: /^(Plan a route|Resume route)$/ }),
    ).toHaveText('Resume route');
    await page
      .getByRole('button', { name: /^(Plan a route|Resume route)$/ })
      .click();
    await expect(journey.getByTestId('journey-destination')).toContainText(
      'National Museum',
    );
    await expect(journey.getByTestId('route-plan-quietest')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  });
}

test('denied GPS retains destination and never routes from the default reference', async ({
  page,
}) => {
  let requests = 0;
  page.on('request', (request) => {
    if (request.url().includes('journey.plan')) requests++;
  });
  await page.goto('/?mockGps=denied');
  await expect(page.getByTestId('parking-list')).toBeVisible();
  await page
    .getByRole('button', { name: /^(Plan a route|Resume route)$/ })
    .click();
  await page
    .getByRole('combobox', { name: 'Search destination' })
    .fill('Museum');
  await page.getByRole('option').click();
  await expect(page.getByTestId('route-destination-search')).toContainText(
    'National Museum',
  );
  await expect(
    page.getByRole('combobox', { name: 'Choose a starting point' }),
  ).toBeVisible();
  expect(requests).toBe(0);
  await page.getByRole('button', { name: 'Use my location' }).click();
  await expect(page.getByRole('status')).toContainText(
    'Enable location permissions',
  );
  expect(requests).toBe(0);
  await page
    .getByRole('combobox', { name: 'Choose a starting point' })
    .fill('Home');
  await page.getByRole('option').click();
  await expect(page.getByTestId('journey-start')).toContainText('Home');
  await expect(page.getByTestId('journey-destination')).toContainText(
    'National Museum',
  );
  await expect(
    page.getByRole('button', { name: 'Start route', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Start route', exact: true }).click();
  await expect(page.getByRole('status')).toContainText(
    'Enable location permissions',
  );
  await expect(page.getByTestId('live-route-marker')).toHaveCount(0);
});

test('parking directions use the shared preview and return to the selected parking', async ({
  page,
}) => {
  await page.goto('/?mockGps=55.9533,-3.1883,5');
  const row = page.locator('[data-testid^="parking-row-"]').first();
  await expect(row).toBeVisible();
  await row.click();
  const selectedId = await row.getAttribute('data-testid');
  await page
    .getByTestId(selectedId!.replace('parking-row-', 'parking-directions-'))
    .click();
  await expect(page.getByTestId('route-journey')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Start route', exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId('finish-at-bike-parking')).toHaveCount(0);
  await page.getByRole('button', { name: 'Back to nearby neuks' }).click();
  await expect(page.getByTestId(selectedId!)).toHaveClass(/selected/);
});

for (const locale of ['en', 'gd', 'es', 'hy']) {
  test(`keeps the journey controls within a narrow viewport in ${locale}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.addInitScript(
      (language) => localStorage.setItem('cycle-parking-language', language),
      locale,
    );
    await page.goto('/?mockGps=55.9533,-3.1883,5');
    await expect(page.getByTestId('parking-list')).toBeVisible();
    await page.getByTestId('plan-route-mobile').click();
    await page.getByRole('combobox').fill('Museum');
    await page.getByRole('option').click();
    await expect(page.getByTestId('route-plan-balanced')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    for (const selector of [
      '.journey-endpoints',
      '.journey-route-choices',
      '.journey-primary',
      '.journey-tools',
    ]) {
      const box = await page.locator(selector).boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(320);
    }
    await page.locator('.journey-primary').scrollIntoViewIfNeeded();
    await expect(page.locator('.journey-primary')).toBeInViewport();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(320);
  });
}

test('retry retains both endpoints after a routing failure', async ({
  page,
}) => {
  let fail = true;
  await page.route(
    'https://api.cyclestreets.net/v2/journey.plan*',
    async (route) => {
      if (!fail) return route.fallback();
      const callback = new URL(route.request().url()).searchParams.get(
        'callback',
      );
      await route.fulfill({
        contentType: 'application/javascript',
        body: `${callback}({error:'No route available'});`,
      });
    },
  );
  await page.goto('/?mockGps=55.9533,-3.1883,5');
  await expect(page.getByTestId('parking-list')).toBeVisible();
  await page
    .getByRole('button', { name: /^(Plan a route|Resume route)$/ })
    .click();
  await page.getByRole('combobox').fill('Museum');
  await page.getByRole('option').click();
  await expect(
    page.getByRole('button', { name: 'Retry', exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId('journey-start')).toContainText(
    'Current location',
  );
  await expect(page.getByTestId('journey-destination')).toContainText(
    'National Museum',
  );
  fail = false;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Start route', exact: true }),
  ).toBeVisible();
});

test('restores the discovery camera after previewing a route', async ({
  page,
}) => {
  await page.goto('/?mockGps=55.9533,-3.1883,5');
  await expect(page.getByTestId('parking-list')).toBeVisible();
  const map = page.getByTestId('parking-map');
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page.waitForTimeout(900); // Let the deliberate camera animation settle.
  const camera = async () =>
    Promise.all(
      [
        'data-map-zoom',
        'data-map-west',
        'data-map-east',
        'data-map-south',
        'data-map-north',
      ].map(async (attribute) => Number(await map.getAttribute(attribute))),
    );
  const before = await camera();
  await page
    .getByRole('button', { name: /^(Plan a route|Resume route)$/ })
    .click();
  await page.getByRole('combobox').fill('Museum');
  await page.getByRole('option').click();
  await expect(
    page.getByRole('button', { name: 'Start route', exact: true }),
  ).toBeVisible();
  await page
    .getByTestId('route-journey')
    .getByRole('button', { name: 'Back to nearby neuks' })
    .click();
  await expect(page.getByTestId('parking-list')).toBeVisible();
  await expect.poll(camera).toEqual(before);
});

for (const [width, height] of [
  [390, 844],
  [1440, 960],
  [320, 568],
]) {
  test(`shows directions without an accordion and anchors route actions at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/?mockGps=55.9533,-3.1883,5');
    await expect(page.getByTestId('parking-list')).toBeVisible();
    await page
      .getByRole('button', { name: /^(Plan a route|Resume route)$/ })
      .click();
    await page.getByRole('combobox').fill('Museum');
    await page.getByRole('option').click();
    const journey = page.getByTestId('route-journey');
    const start = journey.getByRole('button', {
      name: 'Start route',
      exact: true,
    });
    await expect(start).toBeInViewport({ ratio: 1 });
    await expect(journey.locator('details, summary')).toHaveCount(0);
    const steps = journey.getByTestId('directions-list');
    await expect(steps).toBeVisible();
    await steps.locator('button').last().scrollIntoViewIfNeeded();
    await expect(steps.locator('button').last()).toBeInViewport();
    await expect(start).toBeInViewport({ ratio: 1 });
    const footer = await journey.locator('.journey-footer').boundingBox();
    const pane = await page.locator('.control-pane').boundingBox();
    expect(
      pane!.y + pane!.height - (footer!.y + footer!.height),
    ).toBeLessThanOrEqual(14);
    await steps.locator('button').last().click();
    await expect(
      page.locator('.selected-route-instruction-marker'),
    ).toHaveCount(1);
  });
}

for (const width of [390, 1440]) {
  test(`keeps searched endpoints in order through editing at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/?mockGps=denied');
    await expect(page.getByTestId('parking-list')).toBeVisible();
    await page
      .getByRole('button', { name: /^(Plan a route|Resume route)$/ })
      .click();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.getByTestId('journey-start').click();
    await expect(
      page.getByTestId('route-destination-search').getByRole('combobox'),
    ).toHaveCount(1);
    await expect(
      page
        .getByTestId('route-destination-search')
        .getByRole('button', { name: /destination/i }),
    ).toHaveCount(0);
    await expect(page.getByTestId('search-endpoint-context')).toHaveCount(0);
    await page
      .getByRole('combobox', { name: 'Choose a starting point' })
      .fill('Home');
    await page.getByRole('option').click();
    await expect(page.getByTestId('journey-start')).toContainText('Home');
    await expect(page.getByTestId('route-waypoint-marker-0')).not.toHaveClass(
      /route-waypoint-marker-finish/,
    );
    await expect(page.getByTestId('journey-destination')).toContainText(
      'Search destination',
    );
    await page.getByTestId('journey-destination').click();
    await page
      .getByRole('combobox', { name: 'Search destination' })
      .fill('Museum');
    await page.getByRole('option').click();
    await expect(page.getByTestId('journey-destination')).toContainText(
      'National Museum',
    );
    await page.getByRole('button', { name: 'Edit route', exact: true }).click();
    const rows = page.locator('.route-stop-row');
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText('Home');
    await expect(rows.last()).toContainText('National Museum');
    await page
      .getByRole('button', { name: 'Choose a starting point: Home' })
      .click();
    await page.getByRole('combobox').fill('Meadows');
    await page.getByRole('option').click();
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText('Meadows');
    await expect(rows.last()).toContainText('National Museum');
    await page
      .getByRole('button', { name: /Choose destination: National Museum/ })
      .click();
    await expect(
      page.getByRole('combobox', { name: 'Search destination' }),
    ).toBeVisible();
    await expect(page.getByTestId('search-endpoint-context')).toHaveText(
      'Start:Meadows',
    );
    await page.getByRole('combobox').fill('Home');
    await page.getByRole('option').click();
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText('Meadows');
    await expect(rows.last()).toContainText('Home');
  });

  test(`sets and replaces exact map endpoints at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    const requests: number[][][] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (!url.pathname.includes('journey.plan')) return;
      requests.push(
        (url.searchParams.get('waypoints') ?? '')
          .split('|')
          .map((point) => point.split(',').slice(0, 2).map(Number)),
      );
    });
    await page.goto('/?mockGps=denied');
    await expect(page.getByTestId('parking-list')).toBeVisible();
    await page
      .getByRole('button', { name: /^(Plan a route|Resume route)$/ })
      .click();
    const pick = async (target: 'start' | 'destination', x: number) => {
      await expect(
        page.getByRole('combobox', {
          name:
            target === 'start'
              ? 'Choose a starting point'
              : 'Search destination',
        }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Choose on map' }).click();
      const picker = page.getByTestId('route-endpoint-map-picker');
      await expect(picker).toContainText(
        target === 'start' ? 'set the starting point' : 'set the destination',
      );
      if (width === 390) {
        await expect
          .poll(
            async () =>
              (await page.locator('.control-pane').boundingBox())!.height,
          )
          .toBeLessThan(200);
      }
      const map = page.getByTestId('parking-map');
      await expect(map).toHaveAttribute(
        'data-route-waypoint-placement-active',
        'true',
      );
      // Keep selections far enough apart to exercise provider waypoint ordering,
      // including after the previous route has fitted the camera.
      await page
        .getByRole('button', { name: 'Zoom out', exact: true })
        .click({ clickCount: 3 });
      await page.waitForTimeout(900);
      await page
        .locator('.maplibregl-canvas')
        .click({ position: { x, y: 180 } });
      await expect(picker).toHaveCount(0);
    };
    await pick('destination', width === 390 ? 180 : 780);
    await expect(page.getByTestId('search-endpoint-context')).toContainText(
      'Destination:Map point',
    );
    await expect(
      page.getByRole('combobox', { name: 'Choose a starting point' }),
    ).toBeVisible();
    await expect(
      page
        .getByTestId('route-destination-search')
        .getByRole('button', { name: /destination/i }),
    ).toHaveCount(0);
    await expect(page.getByTestId('route-waypoint-marker-1')).toHaveClass(
      /route-waypoint-marker-finish/,
    );
    expect(requests).toHaveLength(0);
    await pick('start', width === 390 ? 100 : 640);
    await expect(page.getByTestId('journey-start')).toContainText('Map point');
    await expect(page.getByTestId('journey-destination')).toContainText(
      'Map point',
    );
    await expect.poll(() => requests.length).toBe(1);
    const first = requests[0]!;
    expect(first).toHaveLength(2);
    expect(first[0]).not.toEqual(first[1]);
    await page.getByTestId('journey-start').click();
    await page.getByRole('button', { name: 'Choose on map' }).click();
    await page
      .getByTestId('route-endpoint-map-picker')
      .getByRole('button', { name: 'Cancel' })
      .click();
    await expect(
      page.getByRole('combobox', { name: 'Choose a starting point' }),
    ).toBeVisible();
    await expect(page.getByTestId('search-endpoint-context')).toContainText(
      'Destination:Map point',
    );
    expect(requests).toHaveLength(1);
    await pick('start', width === 390 ? 300 : 900);
    await expect.poll(() => requests.length).toBe(2);
    expect(requests[1]![1]).toEqual(first[1]);
    expect(requests[1]![0]).not.toEqual(first[0]);
    await page.getByTestId('journey-destination').click();
    await pick('destination', width === 390 ? 140 : 850);
    await expect.poll(() => requests.length).toBe(3);
    expect(requests[2]![0]).toEqual(requests[1]![0]);
    expect(requests[2]![1]).not.toEqual(requests[1]![1]);
    await page.getByRole('button', { name: 'Edit route', exact: true }).click();
    await expect(page.locator('.route-stop-row')).toHaveCount(2);
    await expect(page.locator('.route-stop-row').first()).toContainText(
      'Map point',
    );
    await expect(page.locator('.route-stop-row').last()).toContainText(
      'Map point',
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  });
}
