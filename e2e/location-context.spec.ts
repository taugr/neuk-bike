import { expect, test } from '@playwright/test';
import { installOfflineMapFixture } from './offline-map-fixtures';

test.beforeEach(async ({ context }) => {
  await installOfflineMapFixture(context);
});

for (const state of ['denied', 'unavailable', '55.9533,-3.1883']) {
  test(`explains distance origin for ${state}`, async ({ page }) => {
    await page.goto(`/?mockGps=${state}`);
    const context = page.getByTestId('location-context-desktop');
    if (state.includes(',')) {
      await expect(context).toHaveCount(0);
      await expect(
        page.locator('.start-marker:not(.reference-marker)'),
      ).toBeVisible();
    } else {
      await expect(context).toContainText('Showing Edinburgh');
      await expect(context).not.toContainText('Location permission needed');
      await expect(context).not.toContainText('Location unavailable');
      await context.getByRole('button', { name: 'Use my location' }).click();
      await expect(context).toContainText(
        state === 'denied'
          ? 'Location permission needed'
          : 'Location unavailable',
      );
      await expect(page.locator('.reference-marker')).toHaveAttribute(
        'aria-label',
        'Edinburgh Waverley',
      );
      await expect(
        page.getByRole('button', { name: 'Current location', exact: true }),
      ).toHaveCount(0);
    }
  });
}

test('does not present a shared reference as GPS', async ({ page }) => {
  await page.goto('/?lat=55.9533&lng=-3.1883');
  await expect(page.getByTestId('location-context-desktop')).toHaveCount(0);
  await expect(page.locator('.reference-marker')).toHaveAttribute(
    'aria-label',
    'shared location',
  );
});

test('keeps mobile map controls below the location explanation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?mockGps=denied');
  await expect(page.getByTestId('location-context-mobile')).toContainText(
    'Showing Edinburgh',
  );
  await expect(
    page.getByRole('button', { name: 'Zoom in', exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () => {
      const toolbar = await page.locator('.mobile-map-toolbar').boundingBox();
      const zoom = await page
        .getByRole('button', { name: 'Zoom in', exact: true })
        .boundingBox();
      const layers = await page
        .getByRole('button', { name: 'Map layers', exact: true })
        .boundingBox();
      return Boolean(
        toolbar &&
        zoom &&
        layers &&
        zoom.y >= toolbar.y + toolbar.height &&
        layers.y >= toolbar.y + toolbar.height,
      );
    })
    .toBe(true);
});
