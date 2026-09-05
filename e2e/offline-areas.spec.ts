import { expect, test, type Page } from '@playwright/test';
import {
  expectRenderedBasemap,
  installOfflineMapFixture,
  openOfflineAreas,
  startOfflineAreaDownload,
  waitForServiceWorker,
} from './offline-map-fixtures';

const appUrl = '/?mockGps=55.9533,-3.1883,5';

async function storedAreas(page: Page) {
  return page.evaluate(
    () =>
      new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
        const request = indexedDB.open('neuk-bike-offline-areas', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction('areas', 'readonly');
          const all = transaction.objectStore('areas').getAll();
          all.onerror = () => reject(all.error);
          all.onsuccess = () => resolve(all.result);
          transaction.oncomplete = () => database.close();
        };
      }),
  );
}

test('renders both cached themes and bounded tiles after a cold offline reload', async ({
  context,
  page,
}) => {
  test.setTimeout(90_000);
  const fixture = await installOfflineMapFixture(context);
  await page.goto(appUrl);
  await expect(page.getByTestId('parking-list')).toBeVisible();
  await expectRenderedBasemap(page);
  await waitForServiceWorker(page);

  await startOfflineAreaDownload(page, 'Edinburgh tour');
  const library = page.getByRole('dialog', { name: 'Offline areas' });
  await expect(library).toContainText('Area ready offline.', {
    timeout: 30_000,
  });
  await expect(library).toContainText('Edinburgh tour');
  await library.getByRole('button', { name: 'Close' }).click();

  const providerFailures: string[] = [];
  page.on('requestfailed', (request) => {
    if (request.url().startsWith('https://tiles.openfreemap.org/')) {
      providerFailures.push(request.url());
    }
  });
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('parking-list')).toBeVisible();
  await expectRenderedBasemap(page);
  await expect(page.locator('.offline-basemap-notice')).toHaveCount(0);

  const settings = page.locator('.settings-menu--desktop');
  await settings.locator('.settings-trigger').click();
  await settings
    .getByRole('group', { name: 'Theme' })
    .getByRole('button', { name: 'Dark' })
    .click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expectRenderedBasemap(page);

  const map = page.getByTestId('parking-map');
  const targetZoom = Number(await map.getAttribute('data-map-zoom')) + 1;
  await page.getByLabel('Zoom in').click();
  await expect
    .poll(async () => Number((await map.getAttribute('data-map-zoom')) ?? 0))
    .toBeGreaterThanOrEqual(targetZoom - 0.01);
  const bounds = await map.boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds) {
    await page.mouse.move(
      bounds.x + bounds.width * 0.65,
      bounds.y + bounds.height * 0.5,
    );
    await page.mouse.down();
    await page.mouse.move(
      bounds.x + bounds.width * 0.35,
      bounds.y + bounds.height * 0.5,
      { steps: 8 },
    );
    // Release after inertia expires so this stays a bounded pan, not a fling.
    await page.waitForTimeout(200);
    await page.mouse.up();
  }
  await expectRenderedBasemap(page);
  expect(providerFailures).toEqual([]);
  expect(fixture.requests.some((url) => url.endsWith('.pbf'))).toBe(true);
});

test('cancels, resumes, preserves a completed area after an update failure, and removes it', async ({
  context,
  page,
}) => {
  test.setTimeout(90_000);
  const fixture = await installOfflineMapFixture(context, { delayTiles: true });
  await page.goto(appUrl);
  await expect(page.getByTestId('parking-list')).toBeVisible();
  await waitForServiceWorker(page);

  const selection = await startOfflineAreaDownload(page, 'Resumable tour');
  await expect(selection.getByText(/\d+ of \d+ files/)).toBeVisible();
  await expect(
    selection.getByRole('button', { name: 'Downloading area...' }),
  ).toBeDisabled();
  await selection.getByRole('button', { name: 'Cancel' }).first().click();
  fixture.delayTiles = false;

  const library = await openOfflineAreas(page);
  await expect(library).toContainText('Download incomplete');
  await library.getByRole('button', { name: 'Update' }).click();
  await expect(library).toContainText('Area ready offline.', {
    timeout: 30_000,
  });
  await expect(library).toContainText('Resumable tour');

  const beforeUpdate = await storedAreas(page);
  expect(beforeUpdate).toHaveLength(1);
  const previousUpdatedAt = beforeUpdate[0].updatedAt;
  const resourceUrls = beforeUpdate[0].resourceUrls as string[];
  const failedUrl = resourceUrls.find((url) => url.endsWith('.pbf'));
  expect(failedUrl).toBeTruthy();
  await page.evaluate(async (url) => {
    const cache = await caches.open('neuk-bike-offline-areas-v1');
    await cache.delete(url);
  }, failedUrl!);
  fixture.failMatching = new RegExp(
    failedUrl!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  );
  await library.getByRole('button', { name: 'Update' }).click();
  await expect(library.getByRole('alert')).toContainText(
    'Offline resource request failed (503)',
  );
  const afterFailedUpdate = await storedAreas(page);
  expect(afterFailedUpdate).toHaveLength(1);
  expect(afterFailedUpdate[0]).toMatchObject({
    name: 'Resumable tour',
    status: 'complete',
    updatedAt: previousUpdatedAt,
  });

  fixture.failMatching = undefined;
  await page.evaluate(async (url) => {
    const cache = await caches.open('neuk-bike-offline-areas-v1');
    await cache.put(
      url,
      new Response('', {
        headers: { 'content-type': 'application/vnd.mapbox-vector-tile' },
      }),
    );
  }, failedUrl!);

  page.once('dialog', (dialog) => dialog.accept());
  await library.getByRole('button', { name: 'Remove download' }).click();
  await expect(library).toContainText('No offline areas yet.');
  await expect.poll(() => storedAreas(page)).toHaveLength(0);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const cache = await caches.open('neuk-bike-offline-areas-v1');
        return (await cache.keys()).length;
      }),
    )
    .toBe(0);
});

test('blocks a sixth area and refuses downloads without storage headroom', async ({
  context,
  page,
}) => {
  await installOfflineMapFixture(context);
  await page.addInitScript(() => {
    Object.defineProperty(StorageManager.prototype, 'estimate', {
      configurable: true,
      value: async () => ({ quota: 1_000, usage: 900 }),
    });
  });
  await page.goto(appUrl);
  await expect(page.getByTestId('parking-list')).toBeVisible();
  await waitForServiceWorker(page);

  let selection = await startOfflineAreaDownload(page, 'No room');
  await expect(selection.getByRole('alert')).toContainText(
    'Not enough browser storage is available.',
  );
  await selection.getByRole('button', { name: 'Cancel' }).first().click();

  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('neuk-bike-offline-areas', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const transaction = database.transaction('areas', 'readwrite');
    const store = transaction.objectStore('areas');
    for (let index = 0; index < 4; index += 1) {
      store.put({
        createdAt: '2026-08-20T00:00:00.000Z',
        estimatedBytes: 118 * 1024 * 1024,
        id: `seed-${index}`,
        manifestRefreshedAt: '2026-08-20T00:00:00.000Z',
        name: `Seed ${index + 1}`,
        resourceUrls: [],
        status: 'complete',
        updatedAt: `2026-08-20T00:00:0${index}.000Z`,
      });
    }
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  });

  let library = await openOfflineAreas(page);
  await expect(library).toContainText('4 of 5 areas saved');
  await library.getByRole('button', { name: 'Download this area' }).click();
  selection = page.getByRole('region', { name: 'Download this area' });
  await expect(selection.getByText(/^About /)).toBeVisible();
  await selection.getByRole('button', { name: 'Download area' }).click();
  await expect(selection.getByRole('alert')).toContainText(
    'Offline areas can use up to 500 MB in total.',
  );
  await selection.getByRole('button', { name: 'Cancel' }).first().click();

  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('neuk-bike-offline-areas', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const transaction = database.transaction('areas', 'readwrite');
    transaction.objectStore('areas').put({
      createdAt: '2026-08-20T00:00:00.000Z',
      estimatedBytes: 1,
      id: 'seed-4',
      manifestRefreshedAt: '2026-08-20T00:00:00.000Z',
      name: 'Seed 5',
      resourceUrls: [],
      status: 'complete',
      updatedAt: '2026-08-20T00:00:04.000Z',
    });
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  });

  library = await openOfflineAreas(page);
  await expect(library).toContainText('5 of 5 areas saved');
  await expect(
    library.getByRole('button', { name: 'Download this area' }),
  ).toBeDisabled();
});
