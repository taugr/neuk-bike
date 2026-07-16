import { expect, test } from '@playwright/test';

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
