import { expect, test, type Page } from '@playwright/test';

const parkingOne = {
  id: '1',
  name: 'Cycle parking 1',
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
  await expect(page.getByRole('heading', { name: 'Bike Neuks' })).toBeVisible();
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
  await page.getByTestId(`parking-directions-${parkingOne.id}`).click();
  await expect(
    page.getByRole('region', { name: 'Cycle directions' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: parkingOne.name }),
  ).toBeVisible();
}

test('loads the map-first finder with nearby parking', async ({ page }) => {
  await page.goto('/?mockGps=55.94155,-3.29625,5');

  await expectFinderReady(page);
  await expect(
    page.getByRole('heading', { name: /Nearby cycle parking/ }),
  ).toBeVisible();
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

  await page.getByPlaceholder('Place or postcode').fill('Test Place');
  await page.getByRole('button', { name: 'Search' }).click();
  await page.getByRole('button', { name: /Test Place, Edinburgh/ }).click();

  const parkingRow = page.getByTestId(`parking-row-${parkingOne.id}`);
  await expect(parkingRow).toBeVisible();
  await parkingRow.click();
  await expect(parkingRow).toHaveClass(/selected/);
});

test('opens short local directions from a mocked location', async ({
  page,
}) => {
  await openShortRouteDirections(page);

  await expect(page.getByLabel('Route summary')).toBeVisible();
  await expect(page.getByTestId('directions-list')).toBeVisible();
  await expect(page.locator('.directions-list-item')).toHaveCount(2);
  await expect(page.locator('.directions-list-item').last()).toContainText(
    `Arrive at ${parkingOne.name}`,
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

test('serves generated parking share metadata', async ({ request }) => {
  const response = await request.get(`/parking/${parkingOne.id}/`);
  const html = await response.text();

  expect(response.ok()).toBe(true);
  expect(html).toContain(`<title>${parkingOne.name} | Bike Neuks</title>`);
  expect(html).toContain(
    `<meta http-equiv="refresh" content="0; url=/?parking=${parkingOne.id}">`,
  );
  expect(html).toContain(
    `<meta property="og:title" content="${parkingOne.name} | Bike Neuks">`,
  );
});
