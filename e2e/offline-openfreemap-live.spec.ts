import { expect, test } from '@playwright/test';
import {
  expectRenderedBasemap,
  startOfflineAreaDownload,
  waitForServiceWorker,
} from './offline-map-fixtures';

test.skip(
  process.env.OPENFREEMAP_SMOKE !== '1',
  'Set OPENFREEMAP_SMOKE=1 for the rate-limited provider smoke test.',
);

test('downloads a real bounded OpenFreeMap area and renders it offline', async ({
  context,
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto('/?mockGps=55.9533,-3.1883,5');
  await expect(page.getByTestId('parking-list')).toBeVisible();
  await expectRenderedBasemap(page);
  await waitForServiceWorker(page);

  await startOfflineAreaDownload(page, 'OpenFreeMap smoke');
  const library = page.getByRole('dialog', { name: 'Offline areas' });
  await expect(library).toContainText('Area ready offline.', {
    timeout: 120_000,
  });
  await library.getByRole('button', { name: 'Close' }).click();

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('parking-list')).toBeVisible();
  await expectRenderedBasemap(page);
  await expect(page.locator('.offline-basemap-notice')).toHaveCount(0);
});
