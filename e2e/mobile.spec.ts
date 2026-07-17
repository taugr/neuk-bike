import { expect, test } from '@playwright/test';

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

  await page.getByTestId(`parking-directions-${parkingId}`).click();

  const directions = page.getByRole('region', { name: 'Cycle directions' });
  await expect(directions).toBeVisible();
  await expect(page.getByRole('heading', { name: parkingName })).toBeVisible();
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
        .locator('.mobile-sheet-body')
        .evaluate((element) => element.scrollTop),
    )
    .toBe(0);

  const heading = page.getByRole('heading', { name: /Nearby bike neuks/ });
  await expect(heading).toBeVisible();

  await expect
    .poll(async () => {
      const bodyBounds = await page.locator('.mobile-sheet-body').boundingBox();
      const headingBounds = await heading.boundingBox();

      if (!bodyBounds || !headingBounds) {
        return 0;
      }

      return headingBounds.y - bodyBounds.y;
    })
    .toBeGreaterThanOrEqual(3);
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
  await page.getByTestId(`parking-more-${parkingId}`).click();
  await page.getByTestId(`parking-save-${parkingId}`).click();
  const nearbyScroll = await page
    .locator('.parking-list-scroll')
    .evaluate((element) => {
      element.scrollTop = 120;
      return element.scrollTop;
    });
  expect(nearbyScroll).toBeGreaterThan(0);
  await page.getByTestId('open-my-neuks').click();
  await expect(page.getByRole('heading', { name: /My neuks/ })).toBeVisible();
  await expect(page.locator('.saved-list-item')).toHaveCount(1);
  await expect(page.locator('.saved-list-item .rank')).toHaveCount(0);

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
  await expect
    .poll(() =>
      page
        .locator('.parking-list-scroll')
        .evaluate((element) => element.scrollTop),
    )
    .toBe(nearbyScroll);
});
