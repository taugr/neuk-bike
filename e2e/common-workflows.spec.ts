import { expect, test, type Page } from '@playwright/test';

const parkingOne = {
  id: 'cec:1',
  latitude: 55.9406042783081,
  longitude: -3.29451047885751,
};

const madridParking = {
  id: 'osm:node:8017318200',
  latitude: 40.4166001,
  longitude: -3.703248,
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

async function expectMapFocusedAt(
  page: Page,
  latitude: number,
  longitude: number,
) {
  const map = page.getByTestId('parking-map');
  await expect
    .poll(async () => {
      const [zoom, west, east, south, north] = await Promise.all(
        [
          'data-map-zoom',
          'data-map-west',
          'data-map-east',
          'data-map-south',
          'data-map-north',
        ].map((attribute) => map.getAttribute(attribute)),
      );
      if ([zoom, west, east, south, north].some((value) => value === null)) {
        return false;
      }
      return (
        Number(zoom) > 10 &&
        Number(west) < longitude &&
        Number(east) > longitude &&
        Number(south) < latitude &&
        Number(north) > latitude
      );
    })
    .toBe(true);
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

test('shares a parking link through the native browser chooser', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data: ShareData) => {
        Object.defineProperty(window, '__sharedParkingData', {
          configurable: true,
          value: data,
        });
      },
    });
  });
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
  await page.getByTestId(`parking-more-${parkingOne.id}`).click();
  await page
    .getByTestId(`parking-more-menu-${parkingOne.id}`)
    .getByRole('menuitem', { name: `Share ${parkingName}` })
    .click();

  const sharedData = await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as Window & {
              __sharedParkingData?: ShareData;
            }
          ).__sharedParkingData,
      ),
    )
    .not.toBeUndefined()
    .then(() =>
      page.evaluate(
        () =>
          (
            window as Window & {
              __sharedParkingData?: ShareData;
            }
          ).__sharedParkingData!,
      ),
    );

  expect(sharedData.title).toBe(parkingName);
  const sharedUrl = new URL(sharedData.url ?? '');
  expect(sharedUrl.pathname).toBe('/');
  expect(sharedUrl.searchParams.get('parking')).toBe(parkingOne.id);
  expect(sharedUrl.searchParams.has('mockGps')).toBe(false);
});

test('shows copied feedback when native sharing is unavailable', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: undefined,
    });
    document.execCommand = () => true;
  });
  await page.goto(
    parkingOneReferenceUrl({
      mockGps: `${parkingOne.latitude},${parkingOne.longitude},5`,
    }),
  );
  await expectFinderReady(page);

  await page.getByTestId(`parking-more-${parkingOne.id}`).click();
  const shareButton = page
    .getByTestId(`parking-more-menu-${parkingOne.id}`)
    .getByRole('menuitem', { name: /^Share / });
  await shareButton.click();

  await expect(shareButton.locator('.parking-share-tooltip')).toHaveText(
    'Copied',
  );
});

test('switches and persists the interface language without moving the map', async ({
  page,
}) => {
  await page.goto('/?mockGps=55.94155,-3.29625,5');
  await expectFinderReady(page);
  await expectMapFocusedAt(page, 55.94155, -3.29625);

  const map = page.getByTestId('parking-map');
  const mapCanvas = page.locator('.maplibregl-canvas');
  await mapCanvas.evaluate((canvas) => {
    canvas.setAttribute('data-language-switch-canvas', 'stable');
  });
  const boundsBefore = await Promise.all(
    ['data-map-west', 'data-map-east', 'data-map-south', 'data-map-north'].map(
      (attribute) => map.getAttribute(attribute),
    ),
  );
  const desktopSettings = page.locator(
    '.settings-menu--desktop .settings-trigger',
  );
  await desktopSettings.click();
  await page
    .locator('.settings-menu--desktop .language-select')
    .selectOption('es');

  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(page.locator('#place-search-desktop')).toHaveAttribute(
    'placeholder',
    'Lugar o código postal',
  );
  await expect(
    page.getByRole('heading', { name: /Bike neuks cercanos/ }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Alejar' })).toBeVisible();
  await expect(mapCanvas).toHaveAttribute(
    'data-language-switch-canvas',
    'stable',
  );
  await expect(page.locator('.parking-list-scroll')).toHaveCSS(
    'background-color',
    'rgb(255, 255, 255)',
  );

  const boundsAfter = await Promise.all(
    ['data-map-west', 'data-map-east', 'data-map-south', 'data-map-north'].map(
      (attribute) => map.getAttribute(attribute),
    ),
  );
  boundsBefore.forEach((value, index) => {
    expect(Math.abs(Number(boundsAfter[index]) - Number(value))).toBeLessThan(
      0.03,
    );
  });

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(page.locator('#place-search-desktop')).toHaveAttribute(
    'placeholder',
    'Lugar o código postal',
  );

  await page.locator('.settings-menu--desktop .settings-trigger').click();
  await page
    .locator('.settings-menu--desktop .language-select')
    .selectOption('gd');
  await expect(page.locator('html')).toHaveAttribute('lang', 'gd');
  await expect(page.locator('#place-search-desktop')).toHaveAttribute(
    'placeholder',
    'Àite no còd-puist',
  );
  await expect(
    page.getByRole('heading', { name: /Bike neuks faisg ort/ }),
  ).toBeVisible();
});

test('keeps manual zoom after background parking chunks load', async ({
  page,
}) => {
  const loadedParkingChunks = new Set<string>();
  const selectedParkingChunkPath = '/chunks/12/1962/1255.';
  let releaseBackgroundChunks: () => void = () => {};
  const backgroundChunksReleased = new Promise<void>((resolve) => {
    releaseBackgroundChunks = resolve;
  });

  await page.route('**/data/parking/**/*.json', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const chunkCoordinates = pathname.match(
      /\/chunks\/12\/(\d+)\/(\d+)\.[a-f0-9]+\.json$/,
    );
    const isSelectedAreaChunk =
      chunkCoordinates !== null && Number(chunkCoordinates[1]) < 2_000;

    if (isSelectedAreaChunk && !pathname.includes(selectedParkingChunkPath)) {
      await backgroundChunksReleased;
    }

    await route.continue();
  });
  page.on('response', (response) => {
    const url = new URL(response.url());

    if (
      url.pathname.includes('/data/parking/') &&
      !url.pathname.endsWith('/manifest.json') &&
      !url.pathname.includes('/indexes/point-index.')
    ) {
      loadedParkingChunks.add(url.pathname);
    }
  });

  await page.goto(
    '/?mockGps=56.9560572,-7.4919592,5&parking=osm%3Anode%3A13854635677',
  );
  await expectFinderReady(page);

  const selectedParkingMarker = page.getByRole('button', {
    exact: true,
    name: 'The Square cycle parking, rank 1, selected',
  });
  const zoomOutButton = page.getByRole('button', { name: 'Zoom out' });
  const map = page.getByTestId('parking-map');
  await expect(selectedParkingMarker).toBeVisible();
  await page.waitForTimeout(1_200);
  loadedParkingChunks.clear();

  const initialZoom = Number(await map.getAttribute('data-map-zoom'));
  for (let index = 0; index < 4; index += 1) {
    await zoomOutButton.click();
    await page.waitForTimeout(450);
  }

  const markerAfterZoom = await selectedParkingMarker.boundingBox();
  const zoomAfterManualZoom = Number(await map.getAttribute('data-map-zoom'));
  expect(zoomAfterManualZoom).toBeLessThan(initialZoom - 0.5);
  const westAfterManualZoom = Number(await map.getAttribute('data-map-west'));
  const northAfterManualZoom = Number(await map.getAttribute('data-map-north'));
  releaseBackgroundChunks();
  await expect
    .poll(() => loadedParkingChunks.size, { timeout: 5_000 })
    .toBeGreaterThan(0);
  const markerAfterChunkLoading = await selectedParkingMarker.boundingBox();
  const zoomAfterChunkLoading = Number(await map.getAttribute('data-map-zoom'));
  const westAfterChunkLoading = Number(await map.getAttribute('data-map-west'));
  const northAfterChunkLoading = Number(
    await map.getAttribute('data-map-north'),
  );

  expect(markerAfterZoom).not.toBeNull();
  expect(markerAfterChunkLoading).not.toBeNull();
  expect(
    Math.abs(zoomAfterChunkLoading - zoomAfterManualZoom),
    `map zoom changed from ${zoomAfterManualZoom} to ${zoomAfterChunkLoading}`,
  ).toBeLessThan(0.01);
  expect(Math.abs(westAfterChunkLoading - westAfterManualZoom)).toBeLessThan(
    0.01,
  );
  expect(Math.abs(northAfterChunkLoading - northAfterManualZoom)).toBeLessThan(
    0.01,
  );
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
  await page.route('https://photon.komoot.io/api/**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        features: [
          {
            geometry: {
              coordinates: [parkingOne.longitude, parkingOne.latitude],
            },
            properties: {
              city: 'Edinburgh',
              country: 'United Kingdom',
              name: 'Test Place',
              osm_id: 1_234_567,
              osm_type: 'N',
              state: 'Scotland',
            },
          },
        ],
      },
    });
  });

  await page.goto('/?mockGps=55.94155,-3.29625,5');
  await expectFinderReady(page);

  const finderPanel = page.getByRole('complementary', {
    name: 'Nearest cycle parking',
  });
  const searchbox = finderPanel.getByRole('searchbox');
  await searchbox.fill('Test Place');
  await expect(
    page.getByRole('option', { name: /Test Place, Edinburgh/ }),
  ).toBeVisible();
  await searchbox.press('Enter');

  const parkingRow = page.getByTestId(`parking-row-${parkingOne.id}`);
  await expect(parkingRow).toBeVisible();
  await parkingRow.click();
  await expect(parkingRow).toHaveClass(/selected/);
});

test('searches for a Spanish place and loads Madrid parking', async ({
  page,
}) => {
  await page.route('https://photon.komoot.io/api/**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        features: [
          {
            geometry: { coordinates: [-3.7038, 40.4168] },
            properties: {
              country: 'España',
              name: 'Madrid',
              osm_id: 5_329_560,
              osm_type: 'R',
              state: 'Comunidad de Madrid',
            },
          },
        ],
      },
    });
  });

  await page.goto('/?mockGps=55.94155,-3.29625,5');
  await expectFinderReady(page);

  const finderPanel = page.getByRole('complementary', {
    name: 'Nearest cycle parking',
  });
  await finderPanel.getByRole('searchbox').fill('Madrid');
  await page
    .getByRole('option', { name: /Madrid, Comunidad de Madrid/ })
    .click();

  await expectMapFocusedAt(page, 40.4168, -3.7038);
  await expect(
    page.getByTestId(`parking-row-${madridParking.id}`),
  ).toBeVisible();
});

test('opens short local directions to Spanish parking', async ({ page }) => {
  const params = new URLSearchParams({
    lat: String(madridParking.latitude),
    lng: String(madridParking.longitude),
    parking: madridParking.id,
  });
  await page.goto(`/?${params.toString()}`);
  await expectFinderReady(page);

  const parkingRow = page.getByTestId(`parking-row-${madridParking.id}`);
  await expect(parkingRow).toBeVisible();
  await page.getByTestId(`parking-directions-${madridParking.id}`).click();

  await expect(
    page.getByRole('region', { name: 'Cycle directions' }),
  ).toBeVisible();
  await expect(page.getByLabel('Route summary')).toBeVisible();
  await expect(page.getByTestId('directions-list')).toBeVisible();
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
    const [latitude, longitude] = mockGps.split(',').map(Number);
    await expectMapFocusedAt(page, latitude, longitude);
  });
}

for (const [place, mockGps] of [
  ['Madrid', '40.4168,-3.7038,5'],
  ['Barcelona', '41.3874,2.1686,5'],
  ['Palma', '39.5696,2.6502,5'],
  ['Las Palmas', '28.1235,-15.4363,5'],
] as const) {
  test(`loads mapped cycle parking near ${place}`, async ({ page }) => {
    await page.goto(`/?mockGps=${mockGps}`);
    await expectFinderReady(page);
    const [latitude, longitude] = mockGps.split(',').map(Number);
    await expectMapFocusedAt(page, latitude, longitude);
  });
}

for (const [place, mockGps] of [
  ['Cardiff', '51.4816,-3.1791,5'],
  ['Swansea', '51.6214,-3.9436,5'],
  ['Aberystwyth', '52.4153,-4.0829,5'],
  ['Holyhead', '53.3094,-4.6321,5'],
  ['Belfast', '54.5973,-5.9301,5'],
  ['Derry', '54.9966,-7.3086,5'],
  ['Dublin', '53.3498,-6.2603,5'],
  ['Cork', '51.8985,-8.4756,5'],
  ['Galway', '53.2707,-9.0568,5'],
] as const) {
  test(`loads mapped cycle parking near ${place}`, async ({ page }) => {
    await page.goto(`/?mockGps=${mockGps}`);
    await expectFinderReady(page);
    const [latitude, longitude] = mockGps.split(',').map(Number);
    await expectMapFocusedAt(page, latitude, longitude);
  });
}

for (const [place, mockGps] of [
  ['London', '51.5072,-0.1276,5'],
  ['Manchester', '53.4808,-2.2426,5'],
  ['Birmingham', '52.4862,-1.8904,5'],
  ['Bristol', '51.4545,-2.5879,5'],
  ['Newcastle', '54.9783,-1.6178,5'],
  ['Cambridge', '52.2053,0.1218,5'],
  ['Truro', '50.2632,-5.0510,5'],
  ['Carlisle', '54.8925,-2.9329,5'],
] as const) {
  test(`loads mapped cycle parking near ${place}`, async ({ page }) => {
    await page.goto(`/?mockGps=${mockGps}`);
    await expectFinderReady(page);
    const [latitude, longitude] = mockGps.split(',').map(Number);
    await expectMapFocusedAt(page, latitude, longitude);
  });
}

for (const [place, mockGps, category, pointId, pointName] of [
  [
    'London',
    '51.5072,-0.1276,5',
    'hire',
    'osm:node:865288929',
    'Craven Street',
  ],
  [
    'Cardiff',
    '51.4816,-3.1791,5',
    'shop',
    'osm:node:1050444880',
    'Cycles Direct',
  ],
  [
    'Belfast',
    '54.5973,-5.9301,5',
    'hire',
    'osm:node:3664516151',
    'Belfast Bikes',
  ],
  [
    'Dublin',
    '53.3498,-6.2603,5',
    'hire',
    'osm:node:480606960',
    "Princes Street / O'Connell Street",
  ],
  [
    'Madrid',
    '40.4168,-3.7038,5',
    'hire',
    'osm:node:3158274665',
    'Empresa Municipal de Transportes de Madrid',
  ],
  [
    'Las Palmas',
    '28.1235,-15.4363,5',
    'hire',
    'osm:node:11048294943',
    'Sitycleta Paseo de Chil - Av. Escaleritas',
  ],
] as const) {
  test(`loads nearby cycling places in ${place}`, async ({ page }) => {
    await page.goto(`/?mockGps=${mockGps}`);
    await expectFinderReady(page);
    await page.getByTestId(`category-chip-${category}`).click();
    const row = page.getByTestId(`parking-row-${pointId}`);
    await expect(row).toBeVisible();
    await expect(row.locator('strong')).toHaveText(pointName);
    await expect(
      page.getByText('Nearby cycling places could not be loaded.'),
    ).toHaveCount(0);
  });
}

for (const mockGps of ['denied', 'unavailable'] as const) {
  test(`falls back to Edinburgh when location is ${mockGps}`, async ({
    page,
  }) => {
    await page.goto(`/?mockGps=${mockGps}`);
    await expectFinderReady(page);
    await expect(page.getByTestId('parking-row-cec:178')).toBeVisible();
  });
}

test('explains the dataset boundary for an outside location', async ({
  page,
}) => {
  await page.goto('/?mockGps=54.1523,-4.4861,5');
  await expectFinderReady(page);
  await expect(
    page.getByText(
      'That location is outside the UK, Ireland and Spain, showing bike parking near Edinburgh.',
    ),
  ).toBeVisible();
  await expect(page.getByTestId('parking-row-cec:178')).toBeVisible();
});
