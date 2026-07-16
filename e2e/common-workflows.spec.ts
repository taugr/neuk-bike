import { expect, test, type Page } from '@playwright/test';

const parkingOne = {
  id: 'cec:1',
  latitude: 55.9406042783081,
  longitude: -3.29451047885751,
};

function parkingOneReferenceUrl(extraParams: Record<string, string> = {}) {
  const params = new URLSearchParams({
    lat: String(parkingOne.latitude),
    lng: String(parkingOne.longitude),
    parking: parkingOne.id,
    ...extraParams,
  });

  return `/?${params.toString()}`;
}

async function expectFinderReady(page: Page) {
  await expect(
    page.getByRole('heading', { name: 'Bike Neuks', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Cycle parking map' }),
  ).toBeVisible();
  await expect(page.getByTestId('parking-list')).toBeVisible();
  await expect(page.locator('.parking-list-item')).not.toHaveCount(0);
}

async function openShortRouteDirections(page: Page) {
  await page.goto(
    parkingOneReferenceUrl({
      mockGps: `${parkingOne.latitude},${parkingOne.longitude},5`,
    }),
  );
  await expectFinderReady(page);
  const parkingName = (
    await page
      .getByTestId(`parking-row-${parkingOne.id}`)
      .locator('strong')
      .innerText()
  ).trim();
  await page.getByTestId(`parking-directions-${parkingOne.id}`).click();
  await expect(
    page.getByRole('region', { name: 'Cycle directions' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: parkingName })).toBeVisible();
  return parkingName;
}

test('loads the map-first finder with nearby parking', async ({ page }) => {
  await page.goto('/?mockGps=55.94155,-3.29625,5');

  await expectFinderReady(page);
  await expect(
    page.getByRole('heading', { name: /Nearby bike neuks/ }),
  ).toBeVisible();
});

test('keeps manual zoom after background parking chunks load', async ({
  page,
}) => {
  const loadedParkingChunks = new Set<string>();
  page.on('response', (response) => {
    const url = new URL(response.url());

    if (
      url.pathname.includes('/data/parking/') &&
      !url.pathname.endsWith('/manifest.json') &&
      !url.pathname.endsWith('/point-index.json')
    ) {
      loadedParkingChunks.add(url.pathname);
    }
  });

  await page.goto('/?mockGps=55.8642,-4.2518,5');
  await expectFinderReady(page);

  const currentLocationMarker = page.getByRole('button', {
    exact: true,
    name: 'Current location',
  });
  const zoomOutButton = page.getByRole('button', { name: 'Zoom out' });
  await expect(currentLocationMarker).toBeVisible();
  loadedParkingChunks.clear();

  for (let index = 0; index < 4; index += 1) {
    await zoomOutButton.click();
    await page.waitForTimeout(450);
  }

  const markerAfterZoom = await currentLocationMarker.boundingBox();
  await page.waitForTimeout(1_500);
  const markerAfterChunkLoading = await currentLocationMarker.boundingBox();

  expect(loadedParkingChunks.size).toBeGreaterThan(0);
  expect(markerAfterZoom).not.toBeNull();
  expect(markerAfterChunkLoading).not.toBeNull();
  expect(
    Math.abs(markerAfterChunkLoading!.x - markerAfterZoom!.x),
  ).toBeLessThan(2);
  expect(
    Math.abs(markerAfterChunkLoading!.y - markerAfterZoom!.y),
  ).toBeLessThan(2);
});

test('searches from a place and selects a nearby parking row', async ({
  page,
}) => {
  await page.route(
    'https://nominatim.openstreetmap.org/search**',
    async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        json: [
          {
            display_name: 'Test Place, Edinburgh, Scotland',
            lat: String(parkingOne.latitude),
            lon: String(parkingOne.longitude),
            osm_id: 1_234_567,
          },
        ],
      });
    },
  );

  await page.goto('/?mockGps=55.94155,-3.29625,5');
  await expectFinderReady(page);

  const finderPanel = page.getByRole('complementary', {
    name: 'Nearest cycle parking',
  });
  await finderPanel.getByRole('searchbox').fill('Test Place');
  await finderPanel.getByRole('button', { name: 'Search' }).click();
  await page.getByRole('button', { name: /Test Place, Edinburgh/ }).click();

  const parkingRow = page.getByTestId(`parking-row-${parkingOne.id}`);
  await expect(parkingRow).toBeVisible();
  await parkingRow.click();
  await expect(parkingRow).toHaveClass(/selected/);
});

test('opens short local directions from a mocked location', async ({
  page,
}) => {
  const parkingName = await openShortRouteDirections(page);

  await expect(page.getByLabel('Route summary')).toBeVisible();
  await expect(page.getByTestId('directions-list')).toBeVisible();
  await expect(page.locator('.directions-list-item')).toHaveCount(2);
  await expect(page.locator('.directions-list-item').last()).toContainText(
    `Arrive at ${parkingName}`,
  );
});

test('tracks a mocked live route through arrival', async ({ page }) => {
  const start = '55.94055,-3.29460,5';
  const finish = `${parkingOne.latitude},${parkingOne.longitude},5`;

  await page.goto(
    parkingOneReferenceUrl({
      mockGpsPath: `${start};${finish}`,
      mockGpsStepMs: '50',
    }),
  );
  await expectFinderReady(page);
  await page.getByTestId(`parking-directions-${parkingOne.id}`).click();
  await expect(
    page.getByRole('region', { name: 'Cycle directions' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Start route' }).click();

  await expect(page.getByTestId('live-route-marker')).toBeVisible();
  await expect(page.getByText('Arrived at bike parking.')).toBeVisible({
    timeout: 5_000,
  });
});

for (const [mockGps, message] of [
  ['denied', 'Enable location permissions to start route.'],
  ['unavailable', 'Live location is unavailable.'],
] as const) {
  test(`shows a live-route fallback when mocked GPS is ${mockGps}`, async ({
    page,
  }) => {
    await page.goto(parkingOneReferenceUrl({ mockGps }));
    await expectFinderReady(page);
    await page.getByTestId(`parking-directions-${parkingOne.id}`).click();
    await expect(
      page.getByRole('region', { name: 'Cycle directions' }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Start route' }).click();

    await expect(page.getByRole('status')).toContainText(message);
    await expect(
      page.getByRole('button', { name: 'Start route' }),
    ).toBeVisible();
  });
}

test('resolves a source-qualified parking deep link from the point index', async ({
  page,
}) => {
  await page.goto(`/?parking=${encodeURIComponent(parkingOne.id)}`);
  await expectFinderReady(page);

  const parkingRow = page.getByTestId(`parking-row-${parkingOne.id}`);
  await expect(parkingRow).toBeVisible();
  await expect(parkingRow).toHaveClass(/selected/);
});

test('keeps legacy Edinburgh parking links working', async ({ page }) => {
  await page.goto('/?parking=1');
  await expectFinderReady(page);
  await expect(page.getByTestId(`parking-row-${parkingOne.id}`)).toHaveClass(
    /selected/,
  );
});

for (const [place, mockGps] of [
  ['Glasgow', '55.8642,-4.2518,5'],
  ['Dundee', '56.4620,-2.9707,5'],
  ['Aberdeen', '57.1497,-2.0943,5'],
  ['Inverness', '57.4778,-4.2247,5'],
  ['Fort William', '56.8198,-5.1052,5'],
] as const) {
  test(`loads mapped cycle parking near ${place}`, async ({ page }) => {
    await page.goto(`/?mockGps=${mockGps}`);
    await expectFinderReady(page);
  });
}

test('explains the Scotland boundary for an outside location', async ({
  page,
}) => {
  await page.goto('/?mockGps=51.5072,-0.1276,5');
  await expectFinderReady(page);
  await expect(page.getByText(/outside the Scotland prototype/)).toBeVisible();
});
