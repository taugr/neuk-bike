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

  await page.getByTestId(`parking-directions-${parkingId}`).click();

  const directions = page.getByRole('region', { name: 'Cycle directions' });
  await expect(directions).toBeVisible();
  await expect(page.getByRole('heading', { name: parkingName })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start route' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Exit directions' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Collapse directions panel' }).click();

  await expect(directions).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Expand directions panel' }),
  ).toBeVisible();
});
