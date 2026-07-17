import { expect, test, type Page } from '@playwright/test';

const savedNeuksStorageKey = 'cycle-parking-saved-neuks';
const edinburghParking = {
  id: 'cec:1',
  latitude: 55.9406042783081,
  longitude: -3.29451047885751,
  name: 'Cycle parking 1',
};
const madridParking = {
  id: 'osm:node:8017318200',
  latitude: 40.4166001,
  longitude: -3.703248,
  name: 'Madrid saved neuk',
};

function referenceUrl() {
  const params = new URLSearchParams({
    lat: String(edinburghParking.latitude),
    lng: String(edinburghParking.longitude),
    mockGps: `${edinburghParking.latitude},${edinburghParking.longitude},5`,
    parking: edinburghParking.id,
  });
  return `/?${params.toString()}`;
}

async function mapCamera(page: Page) {
  const map = page.getByTestId('parking-map');
  for (const attribute of [
    'data-map-zoom',
    'data-map-center-latitude',
    'data-map-center-longitude',
  ]) {
    await expect(map).toHaveAttribute(attribute, /.+/);
  }
  return Promise.all(
    [
      'data-map-zoom',
      'data-map-center-latitude',
      'data-map-center-longitude',
    ].map((attribute) => map.getAttribute(attribute)),
  );
}

async function expectMapFocusedAt(
  page: Page,
  latitude: number,
  longitude: number,
) {
  const map = page.getByTestId('parking-map');
  await expect
    .poll(async () => {
      const [west, east, south, north] = await Promise.all(
        [
          'data-map-west',
          'data-map-east',
          'data-map-south',
          'data-map-north',
        ].map((attribute) => map.getAttribute(attribute)),
      );
      return (
        Number(west) <= longitude &&
        Number(east) >= longitude &&
        Number(south) <= latitude &&
        Number(north) >= latitude
      );
    })
    .toBe(true);
}

test('keeps a selected marker and popup inside the desktop map pane', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1024 });
  await page.goto(referenceUrl());

  const selectedMarker = page.getByTestId(
    `parking-marker-${edinburghParking.id}`,
  );
  const popup = page.locator('.maplibregl-popup');

  await expect(selectedMarker).toBeVisible();
  await expect(selectedMarker).toHaveCSS('position', 'absolute');
  await expect(popup).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const mapElement = document.querySelector<HTMLElement>(
          '[data-testid="parking-map"]',
        );
        const mapPane = document.querySelector<HTMLElement>('.map-pane');
        const selectedMarkerElement = document.querySelector<HTMLElement>(
          '[data-testid="parking-marker-cec:1"]',
        );
        const popupElement =
          document.querySelector<HTMLElement>('.maplibregl-popup');

        if (
          !mapElement ||
          !mapPane ||
          !selectedMarkerElement ||
          !popupElement
        ) {
          return null;
        }

        const mapBounds = mapElement.getBoundingClientRect();
        const paneBounds = mapPane.getBoundingClientRect();
        const markerBounds = selectedMarkerElement.getBoundingClientRect();
        const popupBounds = popupElement.getBoundingClientRect();
        const isInsideMap = (bounds: DOMRect) =>
          bounds.left >= mapBounds.left &&
          bounds.right <= mapBounds.right &&
          bounds.top >= mapBounds.top &&
          bounds.bottom <= mapBounds.bottom;

        return {
          mapHeight: Math.round(mapBounds.height),
          markerInsideMap: isInsideMap(markerBounds),
          paneHeight: Math.round(paneBounds.height),
          popupInsideMap: isInsideMap(popupBounds),
        };
      }),
    )
    .toEqual({
      mapHeight: 1024,
      markerInsideMap: true,
      paneHeight: 1024,
      popupInsideMap: true,
    });
});

test('reveals list actions only for the explicitly selected neuk', async ({
  page,
}) => {
  await page.goto('/?mockGps=55.9533,-3.1883,5');

  const list = page.getByTestId('parking-list');
  const rows = list.locator('[data-testid^="parking-row-"]');
  await expect(rows).toHaveCount(8);
  await expect(list.locator('.parking-list-actions')).toHaveCount(0);
  await expect(list.locator('.parking-more-button')).toHaveCount(0);
  await expect(list.locator('.parking-save-button')).toHaveCount(0);

  const firstRow = rows.first();
  await expect(firstRow).toHaveClass(/\bclosest\b/);
  const firstParkingId = (await firstRow.getAttribute('data-testid'))?.replace(
    'parking-row-',
    '',
  );
  expect(firstParkingId).toBeTruthy();

  await firstRow.focus();
  await page.keyboard.press('Enter');
  await expect(firstRow).toHaveClass(/\bclosest\b.*\bselected\b/);
  const firstActions = page.getByTestId(`parking-actions-${firstParkingId}`);
  await expect(firstActions).toBeVisible();
  await expect(firstActions.getByRole('button')).toHaveCount(2);
  const [selectedRowBounds, selectedActionsBounds] = await Promise.all([
    firstRow.boundingBox(),
    firstActions.boundingBox(),
  ]);
  expect(selectedRowBounds).not.toBeNull();
  expect(selectedActionsBounds).not.toBeNull();
  expect(
    Math.abs(
      selectedRowBounds!.y +
        selectedRowBounds!.height / 2 -
        (selectedActionsBounds!.y + selectedActionsBounds!.height / 2),
    ),
  ).toBeLessThan(4);
  await expect(firstActions).toHaveCSS('border-top-width', '0px');
  await expect(firstActions.getByRole('button').nth(0)).toHaveAccessibleName(
    /^Show cycle directions to /,
  );
  await expect(firstActions.getByRole('button').nth(0)).toHaveText('');
  const firstMoreButton = page.getByTestId(`parking-more-${firstParkingId}`);
  await expect(firstMoreButton).toHaveAttribute('aria-expanded', 'false');

  await page.keyboard.press('Tab');
  await expect(firstActions.getByRole('button').nth(0)).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(firstMoreButton).toBeFocused();
  await page.keyboard.press('Enter');
  const firstMoreMenu = page.getByTestId(`parking-more-menu-${firstParkingId}`);
  await expect(firstMoreMenu).toBeVisible();
  await expect(firstMoreMenu.getByRole('menuitem')).toHaveCount(2);
  const firstSaveButton = page.getByTestId(`parking-save-${firstParkingId}`);
  await expect(firstSaveButton).toBeFocused();
  await expect(firstSaveButton).toContainText('Save to My neuks');
  await expect(firstMoreMenu.getByRole('menuitem').nth(1)).toContainText(
    'Share',
  );
  await expect(firstMoreMenu).toHaveCSS('position', 'fixed');
  await expect(firstMoreMenu).toHaveCSS('z-index', '1100');
  await expect
    .poll(() =>
      firstMoreMenu.evaluate((menu) => {
        const bounds = menu.getBoundingClientRect();
        const topmost = document.elementFromPoint(
          bounds.left + bounds.width / 2,
          bounds.top + bounds.height / 2,
        );
        return {
          parentIsBody: menu.parentElement === document.body,
          topmost: topmost === menu || menu.contains(topmost),
        };
      }),
    )
    .toEqual({ parentIsBody: true, topmost: true });
  await page.keyboard.press('Escape');
  await expect(firstMoreMenu).toHaveCount(0);
  await expect(firstMoreButton).toBeFocused();

  await firstMoreButton.click();
  await firstSaveButton.click();
  await expect(firstMoreMenu).toHaveCount(0);

  const secondRow = rows.nth(1);
  await secondRow.click();
  await expect(firstRow).toHaveClass(/\bclosest\b/);
  await expect(firstRow).not.toHaveClass(/\bselected\b/);
  await expect(secondRow).toHaveClass(/\bselected\b/);
  await expect(secondRow).not.toHaveClass(/\bclosest\b/);
  await expect(firstActions).toHaveCount(0);
  await expect(
    page.getByTestId(`parking-saved-status-${firstParkingId}`),
  ).toBeVisible();
  await expect(page.getByTestId(`parking-save-${firstParkingId}`)).toHaveCount(
    0,
  );
  await expect(list.locator('.parking-list-actions')).toHaveCount(1);

  await page.getByTestId('open-my-neuks').click();
  const savedRows = page.locator('.saved-list-item');
  await expect(savedRows).toHaveCount(1);
  await expect(savedRows.locator('.parking-list-actions')).toHaveCount(0);
  await expect(savedRows.locator('.parking-saved-indicator')).toHaveCount(0);

  const savedRow = savedRows.getByTestId(`parking-row-${firstParkingId}`);
  await savedRow.click();
  const savedActions = page.getByTestId(`parking-actions-${firstParkingId}`);
  await expect(savedActions.getByRole('button')).toHaveCount(2);
  await expect(savedActions.getByRole('button').first()).toHaveAccessibleName(
    /^Show cycle directions to /,
  );
  await expect(savedActions.getByRole('button').first()).toHaveText('');
  await page.getByTestId(`parking-more-${firstParkingId}`).click();
  const savedMenu = page.getByTestId(`parking-more-menu-${firstParkingId}`);
  await expect(savedMenu.getByRole('menuitem').first()).toContainText(
    'Remove from My neuks',
  );
  await expect(savedMenu.getByRole('menuitem').nth(1)).toContainText('Share');
});

test('saves a neuk, persists it, and restores Nearby state', async ({
  page,
}) => {
  await page.goto(referenceUrl());
  const row = page.getByTestId(`parking-row-${edinburghParking.id}`);
  await expect(row).toBeVisible();
  await expect(row).toHaveClass(/selected/);

  const saveButton = page.getByTestId(`parking-save-${edinburghParking.id}`);
  const popupSaveButton = page.locator('.parking-popup-save-button');
  await expect(popupSaveButton).toContainText('Save');
  await popupSaveButton.click();
  await expect(popupSaveButton).toContainText('Saved');
  await page.getByTestId(`parking-more-${edinburghParking.id}`).click();
  await expect(saveButton).toContainText('Remove from My neuks');
  await expect(page.getByTestId('open-my-neuks')).toContainText('1');
  await expect(
    page.getByTestId(`parking-marker-${edinburghParking.id}`),
  ).toHaveAttribute('data-saved', 'true');

  await page.reload();
  await expect(row).toHaveClass(/selected/, { timeout: 10_000 });
  const reloadedMoreButton = page.getByTestId(
    `parking-more-${edinburghParking.id}`,
  );
  await expect(async () => {
    if ((await reloadedMoreButton.getAttribute('aria-expanded')) !== 'true') {
      await reloadedMoreButton.click();
    }
    await expect(
      page.getByTestId(`parking-more-menu-${edinburghParking.id}`),
    ).toBeVisible();
  }).toPass();
  await expect(
    page.getByTestId(`parking-save-${edinburghParking.id}`),
  ).toContainText('Remove from My neuks');
  await page.keyboard.press('Escape');

  await expectMapFocusedAt(
    page,
    edinburghParking.latitude,
    edinburghParking.longitude,
  );
  await page.waitForTimeout(900);
  const nearbyCamera = await mapCamera(page);
  await page.getByTestId('open-my-neuks').focus();
  await page.keyboard.press('Enter');
  const myNeuksHeading = page.getByRole('heading', { name: /My neuks/ });
  await expect(myNeuksHeading).toBeVisible();
  await expect(myNeuksHeading).toBeFocused();
  await expect(page.locator('.saved-list-item .rank')).toHaveCount(0);
  await expect(
    page.locator('.saved-list-item .parking-save-button'),
  ).toHaveCount(0);
  await expect(
    page.locator('.saved-list-item .parking-more-button'),
  ).toHaveCount(1);
  await expect(
    page.locator('.parking-marker:not([data-saved="true"])'),
  ).toHaveCount(0);
  await expect.poll(() => mapCamera(page)).toEqual(nearbyCamera);

  await page.getByRole('button', { name: 'Show nearby' }).first().click();
  await expect(
    page.getByRole('heading', { name: /Nearby bike neuks/ }),
  ).toBeVisible();
  await expect(row).toHaveClass(/selected/);
  await expect.poll(() => mapCamera(page)).toEqual(nearbyCamera);
});

test('loads a distant saved neuk and keeps My neuks behind Directions', async ({
  page,
}) => {
  await page.addInitScript(
    ({ key, records }) => {
      window.localStorage.setItem(
        key,
        JSON.stringify({ items: records, version: 1 }),
      );
    },
    {
      key: savedNeuksStorageKey,
      records: [edinburghParking, madridParking].map((point, index) => ({
        id: point.id,
        savedAt: `2026-07-1${8 - index}T12:00:00.000Z`,
        snapshot: {
          latitude: point.latitude,
          longitude: point.longitude,
          name: point.name,
        },
      })),
    },
  );
  await page.goto(referenceUrl());
  await expect(page.getByTestId('open-my-neuks')).toContainText('2');
  await page.getByTestId('open-my-neuks').click();

  const madridRow = page.getByTestId(`parking-row-${madridParking.id}`);
  await expect(madridRow).toBeVisible();
  await madridRow.click();
  await expectMapFocusedAt(
    page,
    madridParking.latitude,
    madridParking.longitude,
  );

  await page.getByTestId(`parking-directions-${madridParking.id}`).click();
  await expect(
    page.getByRole('region', { name: 'Cycle directions' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Exit directions' }).click();
  await expect(page.getByRole('heading', { name: /My neuks/ })).toBeVisible();
  await expect(madridRow).toHaveClass(/selected/);
});

test('explains and removes a saved ID missing from the dataset', async ({
  page,
}) => {
  await page.addInitScript((key) => {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        items: [
          {
            id: 'osm:node:missing',
            savedAt: '2026-07-18T12:00:00.000Z',
            snapshot: {
              latitude: 55.95,
              longitude: -3.19,
              name: 'Old saved neuk',
            },
          },
        ],
      }),
    );
  }, savedNeuksStorageKey);
  await page.goto('/?mockGps=55.9533,-3.1883,5');
  await page.getByTestId('open-my-neuks').click();

  await expect(page.getByText('No longer in the current data')).toBeVisible();
  await page
    .getByRole('button', { name: 'Remove Old saved neuk from My neuks' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'No neuks saved yet' }),
  ).toBeVisible();
});
