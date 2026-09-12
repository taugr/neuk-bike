import { expect, test } from '@playwright/test';
import {
  expectRenderedBasemap,
  installOfflineMapFixture,
  waitForServiceWorker,
} from './offline-map-fixtures';

test('an installed PWA ignores obsolete unversioned workers after an update', async ({
  context,
  page,
}) => {
  await installOfflineMapFixture(context);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?mockGps=55.9533,-3.1883,5');
  await waitForServiceWorker(page);
  await expectRenderedBasemap(page);
  await page.evaluate(async () => {
    // Simulate a previous release's indefinitely cached worker pair. Any reuse
    // fails loudly instead of silently passing with today's copied files.
    const cache = await caches.open('neuk-bike-v15');
    for (const file of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
      await cache.put(
        `/vendor/maplibre-gl/${file}`,
        new Response('throw new Error("Obsolete MapLibre worker reused");', {
          headers: { 'Content-Type': 'application/javascript' },
        }),
      );
    }
  });
  await page.reload();
  await expectRenderedBasemap(page);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const paths: string[] = [];
        for (const name of await caches.keys()) {
          const cache = await caches.open(name);
          for (const request of await cache.keys())
            paths.push(new URL(request.url).pathname);
        }
        return ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'].every(
          (file) =>
            paths.some((path) =>
              new RegExp(
                `/vendor/maplibre-gl/\\d+\\.\\d+\\.\\d+/${file}$`,
              ).test(path),
            ),
        );
      }),
    )
    .toBe(true);
  expect(errors).toEqual([]);
});
