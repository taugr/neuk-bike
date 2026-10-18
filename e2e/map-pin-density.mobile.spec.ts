import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import {
  installOfflineMapFixture,
  expectRenderedBasemap,
} from './offline-map-fixtures';

test.use({ reducedMotion: 'reduce', serviceWorkers: 'block' });
// These full touch journeys render multiple terrain views and model materials.
test.slow();

test('mobile 3D pins thin out, stay stable during small pans and adapt to zoom and tilt', async ({
  page,
  context,
}) => {
  await installOfflineMapFixture(context);
  const tile = fileURLToPath(
    new URL('./fixtures/terrain.png', import.meta.url),
  );
  await context.route(
    'https://elevation-tiles-prod.s3.amazonaws.com/**',
    (route) => route.fulfill({ contentType: 'image/png', path: tile }),
  );
  await page.goto('/?mockGps=55.9533,-3.1883,5');
  await expectRenderedBasemap(page);
  const map = page.getByTestId('parking-map');
  await expect(page.locator('.parking-marker-ranked')).toHaveCount(8);
  await expect(page.locator('.parking-marker-raised')).toHaveCount(0);
  await page.getByRole('button', { name: 'Collapse results panel' }).click();
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await expect
    .poll(async () => Number(await map.getAttribute('data-map-zoom')))
    .toBeLessThan(16.5);
  const flatCount = await page.locator('.parking-marker').count();
  await page.getByRole('button', { name: 'Switch to 3D map' }).click();
  await expect
    .poll(async () => Number(await map.getAttribute('data-map-pitch')), {
      timeout: 15_000,
    })
    .toBeCloseTo(55);
  await expect
    .poll(() => page.locator('.parking-marker').count())
    .toBeLessThan(flatCount);
  await expect(page.locator('.parking-marker-ranked')).toHaveCount(8);
  const raisedHead = page
    .locator('.parking-marker-ranked')
    .first()
    .locator('span')
    .first();
  await expect(raisedHead).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, -22)');
  // Let the final projection update settle after the terrain camera transition.
  await page.waitForTimeout(300);
  const ids = () =>
    page
      .locator('.parking-marker')
      .evaluateAll((pins) =>
        pins.map((pin) => pin.getAttribute('data-testid')),
      );
  const before = await ids();
  // A small genuine touch pan should retain most existing pins.
  const start = await page.evaluate(() => {
    for (const y of [300, 400, 500])
      for (const x of [80, 140, 200])
        if (
          document
            .elementFromPoint(x, y)
            ?.classList.contains('maplibregl-canvas')
        )
          return { x, y };
    throw new Error('No uncovered map area for the pan gesture');
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [start],
  });
  for (let i = 1; i <= 4; i++)
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: start.x + i * 3, y: start.y }],
    });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await page.waitForTimeout(300);
  const after = new Set(await ids());
  expect(
    before.filter((id) => after.has(id)).length / before.length,
  ).toBeGreaterThan(0.75);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: 140, y: 220 },
      { x: 230, y: 220 },
    ],
  });
  for (let i = 1; i <= 10; i++)
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: 140, y: 220 + i * 6 },
        { x: 230, y: 220 + i * 6 },
      ],
    });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await expect
    .poll(async () => Number(await map.getAttribute('data-map-pitch')))
    .toBeLessThan(45);
  await expect(page.locator('.parking-marker-ranked')).toHaveCount(8);
  await expect(raisedHead).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, -22)');
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect
    .poll(async () => Number(await map.getAttribute('data-map-zoom')))
    .toBeGreaterThan(16);
  await expect
    .poll(() => page.locator('.parking-marker').count())
    .toBeGreaterThan(8);
  await cdp.detach();
  await raisedHead.click();
  await expect(page.locator('.parking-marker-selected-ranked')).toHaveCount(1);
  await page.getByRole('button', { name: 'Switch to 2D map' }).click();
  await expect(map).toHaveAttribute('data-map-terrain', 'none');
  await expect(page.locator('.parking-marker-raised')).toHaveCount(0);
  await expect(raisedHead).toHaveCSS('transform', 'none');
  // Selecting a pin recentres the camera, so compare styling rather than
  // counts from two different geographic footprints.
  await expect
    .poll(() => page.locator('.parking-marker').count())
    .toBeGreaterThan(8);
});

for (const satellite of [false, true]) {
  for (const covered of [false, true]) {
    test(`mobile ${satellite ? 'satellite' : 'street'} ${covered ? 'covered' : 'open'} hoop models appear earlier and remain selectable while panning and tilting`, async ({
      page,
      context,
    }) => {
      await installOfflineMapFixture(context);
      const tile = fileURLToPath(
        new URL('./fixtures/terrain.png', import.meta.url),
      );
      await context.route(
        'https://elevation-tiles-prod.s3.amazonaws.com/**',
        (route) => route.fulfill({ contentType: 'image/png', path: tile }),
      );
      await context.route('https://services.arcgisonline.com/**', (route) =>
        route.fulfill({ contentType: 'image/png', path: tile }),
      );
      if (covered) {
        await page.route('**/data/parking/chunks/**', async (route) => {
          const response = await route.fetch();
          const data = await response.json();
          for (const point of Array.isArray(data) ? data : data.points)
            if (point.id === 'cec:178') point.properties.covered = 'yes';
          await route.fulfill({ response, json: data });
        });
      }
      await page.goto('/?mockGps=55.9533,-3.1883,5');
      await expectRenderedBasemap(page);
      await page
        .getByRole('button', { name: 'Collapse results panel' })
        .click();
      if (satellite) {
        await page
          .getByRole('button', { name: 'Map layers', exact: true })
          .click();
        await page
          .getByRole('switch', { name: 'Satellite', exact: true })
          .check();
        await page
          .getByRole('button', { name: 'Map layers', exact: true })
          .click();
        await expect(page.getByTestId('parking-map')).toHaveAttribute(
          'data-map-satellite',
          'ready',
        );
      }
      await page.getByRole('button', { name: 'Switch to 3D map' }).click();
      const map = page.getByTestId('parking-map');
      await expect(map).toHaveAttribute(
        'data-parking-model-contrast',
        satellite ? 'high' : 'standard',
      );
      await expect
        .poll(async () => Number(await map.getAttribute('data-map-pitch')), {
          timeout: 15000,
        })
        .toBeCloseTo(55);
      // Initial fit zoom depends on the phone viewport and collapsed sheet height.
      while (Number(await map.getAttribute('data-map-zoom')) < 17) {
        const zoom = Number(await map.getAttribute('data-map-zoom'));
        await page
          .getByRole('button', { name: 'Zoom in', exact: true })
          .click();
        await expect
          .poll(async () => Number(await map.getAttribute('data-map-zoom')))
          .toBeGreaterThan(zoom + 0.9);
      }
      const hoop = page.getByTestId('parking-marker-cec:178');
      expect(Number(await map.getAttribute('data-map-zoom'))).toBeLessThan(18);
      await expect(hoop).toHaveAttribute('data-model', 'stands');
      const longitude = Number(
        await map.getAttribute('data-map-center-longitude'),
      );
      const cdp = await context.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: 100, y: 500 }],
      });
      for (let i = 1; i <= 8; i++)
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: 100 + i * 4, y: 500 }],
        });
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });
      await expect
        .poll(async () =>
          Number(await map.getAttribute('data-map-center-longitude')),
        )
        .not.toBe(longitude);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [
          { x: 130, y: 230 },
          { x: 230, y: 230 },
        ],
      });
      for (let i = 1; i <= 10; i++)
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [
            { x: 130, y: 230 + i * 5 },
            { x: 230, y: 230 + i * 5 },
          ],
        });
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });
      await cdp.detach();
      await expect
        .poll(async () => Number(await map.getAttribute('data-map-pitch')))
        .toBeLessThan(45);
      await expect
        .poll(async () =>
          Number(await map.getAttribute('data-parking-model-features')),
        )
        .toBeGreaterThan(0);
      await expect(hoop).toHaveAttribute('data-model', 'stands');
      await hoop.click();
      await expect(hoop).toHaveClass(/parking-marker-selected-ranked/);
      if (satellite) {
        await page
          .getByRole('button', { name: 'Map layers', exact: true })
          .click();
        await page
          .getByRole('switch', { name: 'Satellite', exact: true })
          .uncheck();
        await expect(map).toHaveAttribute(
          'data-parking-model-contrast',
          'standard',
        );
        await expect(hoop).toHaveAttribute('data-model', 'stands');
        await page
          .getByRole('switch', { name: 'Satellite', exact: true })
          .check();
        await expect(map).toHaveAttribute('data-map-satellite', 'ready');
        await expect(map).toHaveAttribute(
          'data-parking-model-contrast',
          'high',
        );
        await page
          .getByRole('button', { name: 'Map layers', exact: true })
          .click();
      }
    });
  }
}
