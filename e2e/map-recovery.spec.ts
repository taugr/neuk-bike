import { expect, test } from '@playwright/test';
import {
  expectRenderedBasemap,
  installOfflineMapFixture,
} from './offline-map-fixtures';

test.use({ serviceWorkers: 'block' });
const appUrl = '/?mockGps=55.9533,-3.1883,5';

test('recovers a failed startup style without an online event or page reload', async ({
  context,
  page,
}) => {
  const fixture = await installOfflineMapFixture(context, {
    failNextMatching: /\/styles\//,
  });
  await page.goto(appUrl);
  await expect(page.locator('.offline-basemap-notice')).toBeVisible();
  await expectRenderedBasemap(page);
  await expect(page.locator('.offline-basemap-notice')).toHaveCount(0);
  expect(fixture.failedRequests).toHaveLength(1);
  expect(
    fixture.requests.filter((url) => url.includes('/styles/')).length,
  ).toBeGreaterThan(1);
});

for (const [label, failure] of [
  ['tile metadata', /\/planet$/],
  ['vector tiles', /\.pbf$/],
] as const) {
  test(`retries failed ${label} after the style has loaded`, async ({
    context,
    page,
  }) => {
    const fixture = await installOfflineMapFixture(context, {
      failMatching: failure,
    });
    const successful: string[] = [];
    page.on('response', (response) => {
      if (response.ok() && failure.test(response.url()))
        successful.push(response.url());
    });
    await page.goto(appUrl);
    await expect.poll(() => fixture.failedRequests.length).toBeGreaterThan(0);
    fixture.failMatching = undefined;
    await expect
      .poll(
        () => fixture.requests.filter((url) => url.includes('/styles/')).length,
        { timeout: 15_000 },
      )
      .toBeGreaterThan(1);
    await expect
      .poll(() => successful.length, { timeout: 15_000 })
      .toBeGreaterThan(0);
    await expectRenderedBasemap(page);
    await expect(page.getByTestId('parking-list')).toBeVisible();
  });
}

test('reopening a suspended page recovers outstanding failures without changing its camera', async ({
  context,
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
  });
  const fixture = await installOfflineMapFixture(context, {
    failMatching: /\/styles\//,
  });
  await page.goto(appUrl);
  await expect(page.locator('.offline-basemap-notice')).toBeVisible();
  const map = page.getByTestId('parking-map');
  // Wait for the app's initial GPS focus before measuring recovery's camera.
  await expect
    .poll(async () => Number(await map.getAttribute('data-map-zoom')))
    .toBeGreaterThan(13);
  // Camera attributes also update during the 700 ms automatic focus animation.
  await page.waitForTimeout(1_000);
  const zoom = await map.getAttribute('data-map-zoom');
  fixture.failMatching = undefined;
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(
      new PageTransitionEvent('pageshow', { persisted: true }),
    );
  });
  await expectRenderedBasemap(page);
  await expect(map).toHaveAttribute('data-map-zoom', zoom!);
  const count = fixture.requests.filter((url) =>
    url.includes('/styles/'),
  ).length;
  await page.evaluate(() =>
    window.dispatchEvent(
      new PageTransitionEvent('pageshow', { persisted: true }),
    ),
  );
  await page.waitForTimeout(2_500);
  expect(
    fixture.requests.filter((url) => url.includes('/styles/')),
  ).toHaveLength(count);
});

test('restores the basemap and parking overlays after WebGL context restoration', async ({
  context,
  page,
}) => {
  await installOfflineMapFixture(context);
  await page.goto(appUrl);
  await expectRenderedBasemap(page);
  await page.evaluate(async () => {
    const canvas =
      document.querySelector<HTMLCanvasElement>('.maplibregl-canvas')!;
    const gl = canvas.getContext('webgl2')!;
    const extension = gl.getExtension('WEBGL_lose_context')!;
    await new Promise<void>((resolve) => {
      canvas.addEventListener('webglcontextlost', () => resolve(), {
        once: true,
      });
      extension.loseContext();
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    await new Promise<void>((resolve) => {
      canvas.addEventListener('webglcontextrestored', () => resolve(), {
        once: true,
      });
      extension.restoreContext();
    });
  });
  await expectRenderedBasemap(page);
  await expect(page.locator('.parking-marker').first()).toBeVisible();
  await page.getByLabel('Zoom in').click();
  await expectRenderedBasemap(page);
});
