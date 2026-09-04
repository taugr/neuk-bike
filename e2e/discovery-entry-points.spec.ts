import { expect, test } from '@playwright/test';
import { installOfflineMapFixture } from './offline-map-fixtures';

test.beforeEach(async ({ context }) => {
  await installOfflineMapFixture(context);
});

for (const width of [390, 1440]) {
  test(`offers route planning and compact filters directly at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/?mockGps=55.9533,-3.1883,5');
    await expect(page.getByTestId('parking-list')).toBeVisible();
    const route = page.getByTestId('map-plan-route');
    await expect(route).toHaveText('Plan a route');
    await expect(route).toBeVisible();
    const filters = page.getByTestId('open-parking-filters');
    await expect(filters).toHaveAccessibleName('Parking filters');
    await expect(filters).toHaveText('');
    await expect(filters.locator('svg')).toBeVisible();
    await filters.click();
    await expect(
      page.getByRole('region', { name: 'Parking filters', exact: true }),
    ).toBeVisible();
    await route.click();
    await expect(page.getByTestId('route-map-editor')).toBeVisible();
    await expect(route).toHaveCount(0);
    await page
      .getByTestId('route-map-editor')
      .getByRole('button', { name: 'Cancel', exact: true })
      .click();
    await expect(
      page.getByRole('region', { name: 'Plan a route', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('region', { name: 'Plan a route', exact: true })
      .getByRole('button', { name: 'Back', exact: true })
      .click();
    await expect(route).toBeVisible();
    await page.getByTestId('map-layers-trigger').click();
    await expect(page.getByTestId('map-layers-popover')).toBeVisible();
    const box = await page.getByTestId('map-layers-popover').boundingBox();
    expect(box?.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
  });
}
