import { expect, test } from '@playwright/test';

const routeLocation = {
  latitude: 52.0071274271238,
  longitude: 1.27843987050158,
};

test('opens a fixed-anchor route popup immediately and keeps popups exclusive', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1720, height: 950 });
  await page.goto(
    `/?mockGps=${routeLocation.latitude},${routeLocation.longitude}`,
  );

  const map = page.getByTestId('parking-map');
  await expect
    .poll(async () =>
      Number(await map.getAttribute('data-cycle-network-features')),
    )
    .toBeGreaterThan(0);
  await page.waitForTimeout(800);

  await page.evaluate(() => {
    const testWindow = window as typeof window & {
      __routePopupInitialAnchor?: string | null;
      __routePopupInitialVisibility?: string | null;
    };
    const mapElement = document.querySelector('[data-testid="parking-map"]');
    if (!mapElement) throw new Error('Map element not found');

    testWindow.__routePopupInitialAnchor = null;
    testWindow.__routePopupInitialVisibility = null;
    const observer = new MutationObserver(() => {
      const popup = document
        .querySelector('[data-testid="cycle-network-popup"]')
        ?.closest('.maplibregl-popup');
      if (!popup) return;
      testWindow.__routePopupInitialAnchor =
        [...popup.classList].find((className) =>
          className.startsWith('maplibregl-popup-anchor-'),
        ) ?? null;
      testWindow.__routePopupInitialVisibility =
        getComputedStyle(popup).visibility;
      observer.disconnect();
    });
    observer.observe(mapElement, { childList: true, subtree: true });
  });

  // Route 51 passes through this fixed source location near the map's bottom edge.
  await page.mouse.click(618, 916);
  const routePopup = page.getByTestId('cycle-network-popup');
  await expect(routePopup).toBeVisible();
  await expect(routePopup).toContainText('National Route 51');
  await expect(map).toHaveAttribute(
    'data-cycle-network-selected-route',
    'ncn:51',
  );
  const facts = routePopup.getByTestId('cycle-network-popup-facts');
  await expect(facts).toHaveClass(/cycle-network-popup-details-count-4/);
  await expect(facts.locator('.cycle-network-popup-detail')).toHaveCount(4);
  await expect(
    facts.locator('.cycle-network-popup-detail').first(),
  ).toContainText('On-road');
  await expect(routePopup.locator('.cycle-network-popup-kind')).toHaveCount(0);
  const factGridMetrics = await facts.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return {
      columns: getComputedStyle(element).gridTemplateColumns.split(' ').length,
      height: Math.round(bounds.height),
      width: Math.round(bounds.width),
    };
  });
  expect(factGridMetrics).toMatchObject({ columns: 2, width: 256 });
  expect(factGridMetrics.height).toBeLessThanOrEqual(92);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as typeof window & {
              __routePopupInitialVisibility?: string | null;
            }
          ).__routePopupInitialVisibility,
      ),
    )
    .toBe('visible');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as typeof window & {
              __routePopupInitialAnchor?: string | null;
            }
          ).__routePopupInitialAnchor,
      ),
    )
    .toBe('maplibregl-popup-anchor-bottom');
  await page.waitForTimeout(550);
  await expect(page.locator('.maplibregl-popup')).toHaveClass(
    /maplibregl-popup-anchor-bottom/,
  );
  await expect(page.locator('.maplibregl-popup')).toHaveCount(1);

  const firstParkingRow = page.locator('[data-testid^="parking-row-"]').first();
  await firstParkingRow.getByRole('button').first().click();
  await expect(routePopup).toHaveCount(0);
  await expect(map).not.toHaveAttribute('data-cycle-network-selected-route');
  await expect(page.locator('.maplibregl-popup .parking-popup')).toBeVisible();
  await expect(page.locator('.maplibregl-popup')).toHaveCount(1);

  await page.waitForTimeout(800);
  // The same NCN line remains visible beside the selected parking marker.
  await page.mouse.click(420, 456);
  await expect(page.getByTestId('cycle-network-popup')).toBeVisible();
  await expect(page.locator('.maplibregl-popup .parking-popup')).toHaveCount(0);
  await expect(page.locator('.maplibregl-popup')).toHaveCount(1);

  const desktopSettings = page.locator('.settings-menu--desktop');
  await desktopSettings.locator('.settings-trigger').click();
  await desktopSettings.locator('.language-select').selectOption('es');
  await expect(page.getByTestId('cycle-network-popup')).toHaveCount(0);
});

test('does not download route chunks while the network layer is disabled', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('cycle-parking-cycle-network-visible', 'false');
  });
  const chunkRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/data/cycle-network/chunks/')) {
      chunkRequests.push(request.url());
    }
  });
  await page.setViewportSize({ width: 1720, height: 950 });
  await page.goto(
    `/?mockGps=${routeLocation.latitude},${routeLocation.longitude}`,
  );

  const map = page.getByTestId('parking-map');
  await expect(map).toHaveAttribute('data-cycle-network-enabled', 'false');
  await page.getByTestId('map-layers-trigger').click();
  const mapLayers = page.getByTestId('map-layers-popover');
  const networkSwitch = mapLayers.getByRole('switch', {
    name: 'National Cycle Network',
  });
  await expect(networkSwitch).toBeVisible();
  await expect(networkSwitch).not.toBeChecked();
  expect(chunkRequests).toEqual([]);

  await networkSwitch.check();
  await expect
    .poll(async () =>
      Number(await map.getAttribute('data-cycle-network-features')),
    )
    .toBeGreaterThan(0);
  expect(chunkRequests.length).toBeGreaterThan(0);
});
