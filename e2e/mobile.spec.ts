import { expect, test } from '@playwright/test';

test('keeps the nearby rows stable when the list first loads', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    const samples: number[] = [];
    Object.defineProperty(window, '__parkingListRowTopSamples', {
      configurable: true,
      value: samples,
    });

    function sampleFirstRowPosition() {
      const firstRow =
        document.querySelector<HTMLElement>('.parking-list-item');
      if (firstRow) {
        samples.push(firstRow.getBoundingClientRect().top);
      }
      window.requestAnimationFrame(sampleFirstRowPosition);
    }

    window.requestAnimationFrame(sampleFirstRowPosition);
  });

  await page.goto('/?mockGps=55.9533,-3.1883,5');
  const parkingList = page.getByTestId('parking-list');
  await expect(parkingList.locator('.parking-list-item')).toHaveCount(8);
  await page.waitForTimeout(700);

  const rowTopSamples = await page.evaluate(
    () =>
      (window as Window & { __parkingListRowTopSamples?: number[] })
        .__parkingListRowTopSamples ?? [],
  );
  expect(rowTopSamples.length).toBeGreaterThan(10);
  expect(Math.max(...rowTopSamples) - Math.min(...rowTopSamples)).toBeLessThan(
    4,
  );
});

test('changes language from the mobile menu and keeps the choice', async ({
  page,
}) => {
  await page.goto('/?mockGps=55.9533,-3.1883,5');
  await expect(page.getByTestId('parking-list')).toBeVisible();

  await page.locator('.settings-menu--mobile .settings-trigger').click();
  await page
    .locator('.settings-menu--mobile .language-select')
    .selectOption('gd');
  await expect(page.locator('html')).toHaveAttribute('lang', 'gd');
  await expect(page.locator('#place-search-mobile')).toHaveAttribute(
    'placeholder',
    'Àite no còd-puist',
  );

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'gd');
  await expect(page.locator('#place-search-mobile')).toHaveAttribute(
    'placeholder',
    'Àite no còd-puist',
  );
});

test('keeps the mobile directions panel usable', async ({ page }) => {
  const parkingId = 'cec:1';
  const latitude = 55.9406042783081;
  const longitude = -3.29451047885751;
  const params = new URLSearchParams({
    lat: String(latitude),
    lng: String(longitude),
    mockGps: `${latitude},${longitude},5`,
    parking: parkingId,
  });

  await page.goto(`/?${params.toString()}`);
  await expect(page.getByTestId('parking-list')).toBeVisible();
  const parkingName = (
    await page
      .getByTestId(`parking-row-${parkingId}`)
      .locator('strong')
      .innerText()
  ).trim();

  const mapAttribution = page.locator('.maplibregl-ctrl-bottom-right');
  await expect(mapAttribution).toBeVisible();
  const resultsAttributionTop = await mapAttribution.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).top),
  );

  await page.getByTestId(`parking-row-${parkingId}`).click();
  const directionsShortcut = page.getByTestId(
    `parking-directions-${parkingId}`,
  );
  await expect(directionsShortcut).toHaveText('Directions');
  await directionsShortcut.click();

  const directions = page.getByRole('region', { name: 'Cycle directions' });
  await expect(directions).toBeVisible();
  await expect(
    directions.getByRole('heading', { name: parkingName }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start route' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Exit directions' }),
  ).toBeVisible();
  await expect(page.locator('.mobile-map-toolbar')).toHaveCount(0);

  const directionsAttributionTop = await mapAttribution.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).top),
  );
  expect(directionsAttributionTop).toBeLessThan(resultsAttributionTop);
  expect(directionsAttributionTop).toBeLessThanOrEqual(6);

  await page.getByRole('button', { name: 'Collapse directions panel' }).click();

  await expect(directions).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Expand directions panel' }),
  ).toBeVisible();
});

test('keeps the nearby heading clear after collapsing and expanding', async ({
  page,
}) => {
  const latitude = 55.9533;
  const longitude = -3.1883;

  await page.goto(`/?mockGps=${latitude},${longitude},5`);
  await expect(page.getByTestId('parking-list')).toBeVisible();

  await page.getByRole('button', { name: 'Collapse results panel' }).click();
  await expect(
    page.getByRole('button', { name: 'Expand results panel' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Expand results panel' }).click();
  await expect(
    page.getByRole('button', { name: 'Collapse results panel' }),
  ).toBeVisible();

  const parkingRows = page.locator('[data-testid^="parking-row-"]');
  await expect(parkingRows).toHaveCount(8);
  await parkingRows.last().click();

  await expect
    .poll(() =>
      page
        .locator('.finder-panel-content > .mobile-sheet-body')
        .evaluate((element) => element.scrollTop),
    )
    .toBe(0);

  const heading = page.getByRole('heading', { name: /Nearby bike neuks/ });
  await expect(heading).toBeVisible();

  await expect
    .poll(async () => {
      const bodyBounds = await page
        .locator('.finder-panel-content > .mobile-sheet-body')
        .boundingBox();
      const headingBounds = await heading.boundingBox();

      if (!bodyBounds || !headingBounds) {
        return 0;
      }

      return headingBounds.y - bodyBounds.y;
    })
    .toBeGreaterThanOrEqual(3);
});

test('keeps the collapsed parking details summary inside the sheet', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?mockGps=55.9533,-3.1883,5');

  const longNameRow = page.locator('[data-testid^="parking-row-"]').nth(3);
  await expect(longNameRow).toBeVisible();
  const parkingName = (await longNameRow.locator('strong').innerText()).trim();
  await longNameRow.click();
  await page
    .getByRole('button', { name: `View details for ${parkingName}` })
    .click();

  await expect(
    page.getByRole('region', { name: 'Parking details' }),
  ).toBeVisible();
  const detailsHeading = page.getByRole('heading', {
    name: parkingName,
    exact: true,
  });
  const detailsActions = page.locator('.parking-detail-actions');
  await expect(detailsHeading).toBeVisible();
  await expect(detailsActions).toBeVisible();
  await expect
    .poll(async () => (await detailsHeading.boundingBox())?.height ?? 0)
    .toBeGreaterThan(40);
  await expect
    .poll(async () => {
      const controlPaneBounds = await page
        .locator('.control-pane')
        .boundingBox();
      const actionsBounds = await detailsActions.boundingBox();
      if (!controlPaneBounds || !actionsBounds) {
        return -1;
      }

      return (
        controlPaneBounds.y +
        controlPaneBounds.height -
        (actionsBounds.y + actionsBounds.height)
      );
    })
    .toBeGreaterThanOrEqual(0);
  await expect
    .poll(async () => {
      const controlPaneBounds = await page
        .locator('.control-pane')
        .boundingBox();
      const actionsBounds = await detailsActions.boundingBox();
      if (!controlPaneBounds || !actionsBounds) {
        return Number.POSITIVE_INFINITY;
      }

      return (
        controlPaneBounds.y +
        controlPaneBounds.height -
        (actionsBounds.y + actionsBounds.height)
      );
    })
    .toBeLessThanOrEqual(16);
  await page
    .getByRole('button', { name: 'Collapse parking details panel' })
    .click();

  const controlPane = page.locator('.control-pane');
  const summary = page.locator('.mobile-sheet-summary--details');
  await expect(summary).toBeVisible();
  await expect(summary).toContainText(parkingName);
  await expect
    .poll(async () => {
      const controlPaneBounds = await controlPane.boundingBox();
      const summaryBounds = await summary.boundingBox();
      if (!controlPaneBounds || !summaryBounds) {
        return false;
      }

      return (
        summaryBounds.y - controlPaneBounds.y >= 30 &&
        summaryBounds.y + summaryBounds.height <=
          controlPaneBounds.y + controlPaneBounds.height
      );
    })
    .toBe(true);
});

test('keeps Picardy Place details still when saving', async ({ page }) => {
  const parkingId = 'cec:717';
  const parkingName = 'Picardy Place near Broughton Street';
  const latitude = 55.9568041927908;
  const longitude = -3.1876114928825;
  const params = new URLSearchParams({
    lat: String(latitude),
    lng: String(longitude),
    mockGps: `${latitude},${longitude},5`,
    parking: parkingId,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/?${params.toString()}`);
  const parkingRow = page.getByTestId(`parking-row-${parkingId}`);
  await expect(parkingRow).toBeVisible();
  await parkingRow.click();
  await page.getByTestId(`parking-details-${parkingId}`).click();

  const detailBody = page.locator('.parking-detail-body');
  const controlPane = page.locator('.control-pane');
  const detailActions = page.locator('.parking-detail-actions');
  await expect(
    page.getByRole('heading', { name: parkingName, exact: true }),
  ).toBeVisible();
  const beforeSave = await page.evaluate(() => {
    const body = document.querySelector<HTMLElement>('.parking-detail-body');
    const pane = document.querySelector<HTMLElement>('.control-pane');
    const actions = document.querySelector<HTMLElement>(
      '.parking-detail-actions',
    );

    return {
      actionsTop: actions?.getBoundingClientRect().top ?? 0,
      bodyClientHeight: body?.clientHeight ?? 0,
      bodyScrollHeight: body?.scrollHeight ?? 0,
      bodyScrollTop: body?.scrollTop ?? -1,
      paneHeight: pane?.getBoundingClientRect().height ?? 0,
      pageScrollTop: window.scrollY,
    };
  });
  expect(beforeSave.bodyScrollHeight).toBeLessThanOrEqual(
    beforeSave.bodyClientHeight,
  );
  expect(beforeSave.bodyScrollTop).toBe(0);

  await page
    .getByRole('button', {
      name: `Save ${parkingName} to My neuks`,
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('button', {
      name: `Remove ${parkingName} from My neuks`,
      exact: true,
    }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(detailBody).toBeVisible();
  await expect(controlPane).toBeVisible();
  await expect(detailActions).toBeVisible();

  const afterSave = await page.evaluate(() => {
    const body = document.querySelector<HTMLElement>('.parking-detail-body');
    const pane = document.querySelector<HTMLElement>('.control-pane');
    const actions = document.querySelector<HTMLElement>(
      '.parking-detail-actions',
    );
    const focusedAction = document.activeElement as HTMLElement | null;
    const focusedActionBounds = focusedAction?.getBoundingClientRect();
    const focusedActionStyles = focusedAction
      ? window.getComputedStyle(focusedAction)
      : null;
    const bodyBounds = body?.getBoundingClientRect();

    return {
      actionsTop: actions?.getBoundingClientRect().top ?? 0,
      bodyClientHeight: body?.clientHeight ?? 0,
      bodyScrollHeight: body?.scrollHeight ?? 0,
      bodyScrollTop: body?.scrollTop ?? -1,
      focusedActionBottom: focusedActionBounds?.bottom ?? 0,
      focusedActionOutlineOffset: focusedActionStyles
        ? Number.parseFloat(focusedActionStyles.outlineOffset)
        : 0,
      focusedActionOutlineWidth: focusedActionStyles
        ? Number.parseFloat(focusedActionStyles.outlineWidth)
        : 0,
      bodyBottom: bodyBounds?.bottom ?? 0,
      paneHeight: pane?.getBoundingClientRect().height ?? 0,
      pageScrollTop: window.scrollY,
    };
  });
  expect(afterSave.bodyScrollHeight).toBeLessThanOrEqual(
    afterSave.bodyClientHeight,
  );
  expect(afterSave.bodyScrollTop).toBe(0);
  expect(
    afterSave.focusedActionBottom +
      afterSave.focusedActionOutlineOffset +
      afterSave.focusedActionOutlineWidth,
  ).toBeLessThanOrEqual(afterSave.bodyBottom - 2);
  expect(afterSave.pageScrollTop).toBe(beforeSave.pageScrollTop);
  expect(Math.abs(afterSave.paneHeight - beforeSave.paneHeight)).toBeLessThan(
    1,
  );
  expect(Math.abs(afterSave.actionsTop - beforeSave.actionsTop)).toBeLessThan(
    1,
  );
});

test('resizes details when switching directly between map pins', async ({
  page,
}) => {
  const shortParkingId = 'cec:1383';
  const shortParkingName = 'Picardy Place near Leith Street';
  const longParkingId = 'cec:902';
  const longParkingName = 'Broughton Street Lane by Oh! Outhouse';
  const latitude = 55.9568041927908;
  const longitude = -3.1876114928825;
  const params = new URLSearchParams({
    lat: String(latitude),
    lng: String(longitude),
    mockGps: `${latitude},${longitude},5`,
    parking: shortParkingId,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/?${params.toString()}`);
  await page.getByTestId(`parking-row-${shortParkingId}`).click();
  await page.getByTestId(`parking-details-${shortParkingId}`).click();
  await expect(page.locator('.control-pane')).toHaveAttribute(
    'data-panel-transition',
    'navigate',
  );
  await expect(
    page.getByRole('heading', { name: shortParkingName, exact: true }),
  ).toBeVisible();

  const shortPaneHeight =
    (await page.locator('.control-pane').boundingBox())?.height ?? 0;
  await page
    .getByTestId(`parking-marker-${longParkingId}`)
    .evaluate((marker: HTMLElement) => marker.click());
  await expect(page.locator('.control-pane')).toHaveAttribute(
    'data-panel-transition',
    'replace',
  );
  await expect(
    page.getByRole('heading', { name: longParkingName, exact: true }),
  ).toBeVisible();

  await expect
    .poll(async () => {
      const detailBody = page.locator(
        `.parking-detail-body[data-parking-detail-id="${longParkingId}"]`,
      );
      return detailBody.evaluate(
        (body) => body.scrollHeight <= body.clientHeight,
      );
    })
    .toBe(true);

  const longPaneHeight =
    (await page.locator('.control-pane').boundingBox())?.height ?? 0;
  expect(longPaneHeight).toBeGreaterThan(shortPaneHeight);

  await page
    .getByTestId(`parking-marker-${shortParkingId}`)
    .evaluate((marker: HTMLElement) => marker.click());
  await expect(
    page.getByRole('heading', { name: shortParkingName, exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () => {
      const detailBody = page.locator(
        `.parking-detail-body[data-parking-detail-id="${shortParkingId}"]`,
      );
      return detailBody.evaluate(
        (body) => body.scrollHeight <= body.clientHeight,
      );
    })
    .toBe(true);

  const resizedShortPaneHeight =
    (await page.locator('.control-pane').boundingBox())?.height ?? 0;
  expect(resizedShortPaneHeight).toBeLessThan(longPaneHeight);
});

test('uses at most one camera move when selecting a pin from collapsed details', async ({
  page,
}) => {
  const firstParkingId = 'cec:1383';
  const firstParkingName = 'Picardy Place near Leith Street';
  const secondParkingId = 'cec:902';
  const secondParkingName = 'Broughton Street Lane by Oh! Outhouse';
  const latitude = 55.9568041927908;
  const longitude = -3.1876114928825;
  const params = new URLSearchParams({
    lat: String(latitude),
    lng: String(longitude),
    mockGps: `${latitude},${longitude},5`,
    parking: firstParkingId,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/?${params.toString()}`);
  await page.getByTestId(`parking-row-${firstParkingId}`).click();
  await page.getByTestId(`parking-details-${firstParkingId}`).click();
  await expect(
    page.getByRole('heading', { name: firstParkingName, exact: true }),
  ).toBeVisible();

  const controlPane = page.locator('.control-pane');
  await page
    .getByRole('button', { name: 'Collapse parking details panel' })
    .click();
  await expect(controlPane).toHaveAttribute(
    'data-mobile-sheet-state',
    'collapsed',
  );
  await expect
    .poll(async () => (await controlPane.boundingBox())?.height ?? 0)
    .toBeLessThan(100);
  await page.waitForTimeout(1_100);

  await page.evaluate(() => {
    const map = document.querySelector<HTMLElement>('.bike-map');
    if (!map) {
      throw new Error('Map element not found');
    }

    const centers = new Set<string>();
    const observer = new MutationObserver(() => {
      const latitude = map.dataset.mapCenterLatitude;
      const longitude = map.dataset.mapCenterLongitude;
      if (latitude && longitude) {
        centers.add(`${latitude},${longitude}`);
      }
    });
    observer.observe(map, {
      attributeFilter: [
        'data-map-center-latitude',
        'data-map-center-longitude',
      ],
      attributes: true,
    });
    Object.assign(window, {
      __parkingCameraCenters: centers,
      __parkingCameraObserver: observer,
    });
  });

  await page
    .getByTestId(`parking-marker-${secondParkingId}`)
    .evaluate((marker: HTMLElement) => marker.click());
  await expect(controlPane).toHaveAttribute(
    'data-mobile-sheet-state',
    'expanded',
  );
  await expect(
    page.getByRole('heading', { name: secondParkingName, exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(1_300);

  const cameraCenters = await page.evaluate(() => {
    const testWindow = window as typeof window & {
      __parkingCameraCenters?: Set<string>;
      __parkingCameraObserver?: MutationObserver;
    };
    testWindow.__parkingCameraObserver?.disconnect();
    return [...(testWindow.__parkingCameraCenters ?? [])];
  });
  expect(cameraCenters.length).toBeLessThanOrEqual(1);
});

test('keeps My neuks usable in the mobile sheet', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?mockGps=55.9533,-3.1883,5');
  const firstRow = page.locator('[data-testid^="parking-row-"]').first();
  await expect(firstRow).toBeVisible();
  const parkingId = (await firstRow.getAttribute('data-testid'))?.replace(
    'parking-row-',
    '',
  );
  expect(parkingId).toBeTruthy();

  await firstRow.click();
  await page.getByTestId(`parking-details-${parkingId}`).click();
  await page.getByRole('button', { name: /Save .* to My neuks/ }).click();
  await page.getByRole('button', { name: 'Back to nearby neuks' }).click();
  const nearbyScroll = await page
    .locator('.parking-list-scroll')
    .evaluate((element) => {
      element.scrollTop = 120;
      return element.scrollTop;
    });
  expect(nearbyScroll).toBeGreaterThan(0);
  await page.getByTestId('open-my-neuks').click();
  await expect(
    page.locator('.parking-view-content[data-parking-view="saved"]'),
  ).toBeVisible();
  await expect(
    page.locator('.parking-view-content[data-parking-view="nearby"]'),
  ).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /My neuks/ })).toBeVisible();
  await expect(page.locator('.saved-list-item')).toHaveCount(1);
  await expect(page.locator('.saved-list-item .rank')).toHaveCount(0);
  await expect(page.locator('.saved-list-item')).toBeInViewport();
  await expect
    .poll(async () => {
      const bounds = await page.locator('.control-pane').boundingBox();
      return bounds?.height ?? 844;
    })
    .toBeLessThan(844 * 0.4);

  await page.getByRole('button', { name: 'Collapse My neuks panel' }).click();
  await expect(
    page.getByRole('button', { name: 'Expand My neuks panel' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Expand My neuks panel' }).click();
  await expect
    .poll(() =>
      page
        .locator('.mobile-sheet-body')
        .evaluate((element) => element.scrollTop),
    )
    .toBe(0);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);

  await page.getByRole('button', { name: 'Show nearby' }).first().click();
  await expect(
    page.locator('.parking-view-content[data-parking-view="nearby"]'),
  ).toBeVisible();
  await expect(
    page.locator('.parking-view-content[data-parking-view="saved"]'),
  ).toHaveCount(0);
  await expect
    .poll(() =>
      page
        .locator('.parking-list-scroll')
        .evaluate((element) => element.scrollTop),
    )
    .toBe(nearbyScroll);
});

test('keeps the list open for comparison before opening details', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?mockGps=55.9533,-3.1883,5');

  const rows = page.locator('[data-testid^="parking-row-"]');
  await expect(rows).toHaveCount(8);
  const firstRow = rows.nth(0);
  const secondRow = rows.nth(1);
  const firstParkingId = (await firstRow.getAttribute('data-testid'))?.replace(
    'parking-row-',
    '',
  );
  const secondParkingId = (
    await secondRow.getAttribute('data-testid')
  )?.replace('parking-row-', '');
  expect(firstParkingId).toBeTruthy();
  expect(secondParkingId).toBeTruthy();

  await firstRow.click();
  await expect(firstRow).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByTestId(`parking-popup-details-${firstParkingId}`),
  ).toBeVisible();
  await expect(
    page.getByTestId(`parking-details-${firstParkingId}`),
  ).toBeVisible();
  await expect(
    page.getByTestId(`parking-directions-${firstParkingId}`),
  ).toHaveText('Directions');
  await expect(
    page.getByTestId(`parking-directions-${firstParkingId}`),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Parking details' }),
  ).toHaveCount(0);

  await secondRow.click();
  await expect(firstRow).toHaveAttribute('aria-pressed', 'false');
  await expect(secondRow).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByTestId(`parking-popup-details-${secondParkingId}`),
  ).toBeVisible();
  await expect(
    page.getByTestId(`parking-details-${firstParkingId}`),
  ).toHaveCount(0);

  const secondDetailsButton = page.getByTestId(
    `parking-details-${secondParkingId}`,
  );
  await secondDetailsButton.click();
  await expect(
    page.getByRole('region', { name: 'Parking details' }),
  ).toBeVisible();
  const backButton = page.getByRole('button', {
    name: 'Back to nearby neuks',
  });
  await backButton.focus();
  await page.keyboard.press('Enter');
  await expect(secondDetailsButton).toBeFocused();
  await expect(
    page.getByRole('region', { name: 'Parking details' }),
  ).toHaveCount(0);

  await page.getByTestId(`parking-marker-${firstParkingId}`).press('Enter');
  await expect(
    page.getByRole('region', { name: 'Parking details' }),
  ).toBeVisible();
});

test('returns directions to the mobile view that launched them', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?mockGps=55.9533,-3.1883,5');

  const firstRow = page.locator('[data-testid^="parking-row-"]').first();
  await expect(firstRow).toBeVisible();
  const parkingId = (await firstRow.getAttribute('data-testid'))?.replace(
    'parking-row-',
    '',
  );
  expect(parkingId).toBeTruthy();

  await firstRow.click();
  await page.getByTestId(`parking-directions-${parkingId}`).click();
  await expect(
    page.getByRole('region', { name: 'Cycle directions' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Exit directions' }).click();
  await expect(page.getByTestId('parking-list')).toBeVisible();
  await expect(firstRow).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByRole('region', { name: 'Parking details' }),
  ).toHaveCount(0);

  await page.getByTestId(`parking-details-${parkingId}`).click();
  const details = page.getByRole('region', { name: 'Parking details' });
  await expect(details).toBeVisible();
  await details.getByRole('button', { name: 'Directions' }).click();
  await expect(
    page.getByRole('region', { name: 'Cycle directions' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Exit directions' }).click();
  await expect(details).toBeVisible();
  await expect(page.locator('.control-pane')).toHaveAttribute(
    'data-panel-transition',
    'navigate',
  );
});

test('keeps content-sized details compact on a tall mobile viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 1_000 });
  await page.goto('/?mockGps=55.9533,-3.1883,5');

  const firstRow = page.locator('[data-testid^="parking-row-"]').first();
  const parkingId = (await firstRow.getAttribute('data-testid'))?.replace(
    'parking-row-',
    '',
  );
  expect(parkingId).toBeTruthy();
  await firstRow.click();
  await page.getByTestId(`parking-details-${parkingId}`).click();

  const controlPane = page.locator('.control-pane');
  const detailsBody = page.locator('.parking-detail-body');
  await expect(detailsBody).toBeVisible();
  await expect
    .poll(async () => (await controlPane.boundingBox())?.height ?? 1_000)
    .toBeLessThan(500);
  await expect
    .poll(() =>
      detailsBody.evaluate((body) => body.scrollHeight <= body.clientHeight),
    )
    .toBe(true);
});

test('keeps the mobile interaction contract usable with reduced motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?mockGps=55.9533,-3.1883,5');

  const firstRow = page.locator('[data-testid^="parking-row-"]').first();
  const parkingId = (await firstRow.getAttribute('data-testid'))?.replace(
    'parking-row-',
    '',
  );
  expect(parkingId).toBeTruthy();
  await firstRow.click();
  await expect(firstRow).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId(`parking-details-${parkingId}`).click();
  await expect(
    page.getByRole('region', { name: 'Parking details' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Back to nearby neuks' }).click();
  await expect(page.getByTestId('parking-list')).toBeVisible();
});
