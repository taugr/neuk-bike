import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import {
  installOfflineMapFixture,
  expectRenderedBasemap,
} from './offline-map-fixtures';

test.use({ reducedMotion: 'reduce', serviceWorkers: 'block' });
// These full touch journeys render multiple terrain views and model materials.
test.slow();

test.describe('Edinburgh city tiles', () => {
  test.use({ deviceScaleFactor: 1 });

  test.beforeEach(async ({ context }) => {
    await installOfflineMapFixture(context);
    const image = fileURLToPath(
      new URL('./fixtures/terrain.png', import.meta.url),
    );
    for (const origin of [
      'https://elevation-tiles-prod.s3.amazonaws.com',
      'https://services.arcgisonline.com',
    ]) {
      await context.route(`${origin}/**`, (route) =>
        route.fulfill({
          contentType: 'image/png',
          headers: { 'access-control-allow-origin': '*' },
          path: image,
        }),
      );
    }
  });

  test('Edinburgh streams detailed and overview buildings and keeps mobile badges tappable', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem('bike-neuk-map-satellite', 'true');
      localStorage.setItem('bike-neuk-map-3d', 'true');
    });
    const meshResponses = new Set<string>();
    const overviewResponses = new Set<string>();
    page.on('response', (response) => {
      if (
        response.ok() &&
        response.url().includes('/data/edinburgh-buildings/meshes/')
      )
        meshResponses.add(response.url());
      if (response.ok() && /\/overview\/\d+\/\d+\.bin\.gz/.test(response.url()))
        overviewResponses.add(response.url());
    });
    await page.goto('/?lat=55.95875&lng=-3.2097');
    const map = page.getByTestId('parking-map');
    await expect(map).toHaveAttribute('data-map-initializing', 'false', {
      timeout: 30_000,
    });
    const zoom = () => map.getAttribute('data-map-zoom').then(Number);
    const zoomIn = page.getByRole('button', { name: 'Zoom in', exact: true });
    while ((await zoom()) < 17) {
      const current = await zoom();
      await zoomIn.tap();
      await expect
        .poll(zoom, { timeout: 15_000 })
        .toBeGreaterThan(current + 0.5);
    }
    await expect(map).toHaveAttribute(
      'data-map-edinburgh-mesh-tiles',
      /[2-9]/,
      {
        timeout: 30_000,
      },
    );
    await expect(map).toHaveAttribute('data-map-aerial-roofs', 'materials');
    expect(meshResponses.size).toBeGreaterThan(1);
    expect(meshResponses.size).toBeLessThanOrEqual(9);
    await page.getByRole('button', { name: 'Collapse results panel' }).tap();
    const initialZoom = await zoom();
    const zoomOut = page.getByRole('button', { name: 'Zoom out', exact: true });
    await zoomOut.tap();
    await expect.poll(zoom).toBeLessThan(initialZoom);
    await zoomOut.tap();
    await expect.poll(zoom).toBeLessThan(16);
    await expect(map).toHaveAttribute('data-map-aerial-roofs', 'materials');
    await expect(map).toHaveAttribute(
      'data-map-edinburgh-overview-tiles',
      /^(?:[1-9]|1[0-2])$/,
    );
    await expect
      .poll(async () =>
        Number(await map.getAttribute('data-map-edinburgh-overview-triangles')),
      )
      .toBeGreaterThan(0);
    expect(
      Number(await map.getAttribute('data-map-edinburgh-overview-triangles')),
    ).toBeLessThanOrEqual(1_000_000);
    expect(
      Number(await map.getAttribute('data-map-edinburgh-overview-bytes')),
    ).toBeLessThanOrEqual(8 * 1024 * 1024);
    expect(overviewResponses.size).toBeGreaterThan(0);
    await expect(map).toHaveAttribute('data-parking-model-scale', '1');
    await zoomIn.tap();
    await zoomIn.tap();
    await expect.poll(zoom).toBeCloseTo(initialZoom, 1);
    await map
      .getByRole('button', {
        name: 'Raeburn Place near Dean Street, rank 1',
        exact: true,
      })
      .tap();
    await expect(
      page.getByRole('heading', { name: 'Raeburn Place near Dean Street' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Switch to 2D map' }).tap();
    await expect(map).not.toHaveAttribute(
      'data-map-edinburgh-mesh-tiles',
      /\d+/,
    );
    await expect(map).toHaveAttribute('data-map-satellite', 'ready');
  });

  test('Edinburgh city overview keeps Portobello visible while finer meshes load', async ({
    page,
  }) => {
    let allowNeighbourhoods!: () => void;
    const neighbourhoodsReady = new Promise<void>((resolve) => {
      allowNeighbourhoods = resolve;
    });
    let neighbourhoodRequested = false;
    await page.route(
      '**/edinburgh-buildings/overview/**/*.bin.gz?*',
      async (route) => {
        neighbourhoodRequested = true;
        await neighbourhoodsReady;
        await route.continue();
      },
    );
    await page.goto(
      '/?lat=55.9532&lng=-3.1134&aerialPreview=1&buildings=edinburgh&landmark=edinburgh-city',
    );
    const map = page.getByTestId('parking-map');
    await expect(map).toHaveAttribute(
      'data-map-edinburgh-city-overview-tiles',
      /^[1-9]\d?$/,
      { timeout: 30_000 },
    );
    await expect(map).toHaveAttribute('data-map-aerial-roofs', 'materials');
    expect(Number(await map.getAttribute('data-map-zoom'))).toBeLessThan(13);
    await expect(map).not.toHaveAttribute(
      'data-map-edinburgh-overview-tiles',
      /\d+/,
    );
    const triangles = Number(
      await map.getAttribute('data-map-edinburgh-city-overview-triangles'),
    );
    expect(triangles).toBeGreaterThan(0);
    expect(triangles).toBeLessThanOrEqual(1_500_000);
    expect(
      Number(await map.getAttribute('data-map-edinburgh-city-overview-bytes')),
    ).toBeLessThanOrEqual(12 * 1024 * 1024);
    try {
      await page.getByRole('button', { name: 'Collapse results panel' }).tap();
      await page.getByRole('button', { name: 'Zoom in', exact: true }).tap();
      await expect
        .poll(async () => Number(await map.getAttribute('data-map-zoom')))
        .toBeGreaterThan(13);
      await expect.poll(() => neighbourhoodRequested).toBe(true);
      await expect(map).toHaveAttribute(
        'data-map-edinburgh-city-overview-tiles',
        /^[1-9]\d?$/,
      );
      await expect(map).toHaveAttribute('data-map-aerial-roofs', 'materials');
    } finally {
      allowNeighbourhoods();
    }
    await expect(map).toHaveAttribute(
      'data-map-edinburgh-overview-tiles',
      /^[1-9]\d?$/,
    );
  });
});

test.describe('Waverley LiDAR', () => {
  // Keep the phone viewport and touch input while capping software WebGL
  // framebuffer size in headless Chromium.
  test.use({ deviceScaleFactor: 1 });

  for (const shaded of [false, true]) {
    test(`Waverley aerial preview loads LiDAR and keeps the scaled stand tappable (${shaded ? 'shaded' : 'textured'})`, async ({
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
        route.fulfill({
          contentType: 'image/png',
          headers: { 'access-control-allow-origin': '*' },
          path: tile,
        }),
      );
      // A single representative footprint, in the real survey area, exercises
      // measured geometry without depending on the live OpenFreeMap release.
      await context.route('**/14/8046/5105.pbf', (route) =>
        route.fulfill({
          contentType: 'application/x-protobuf',
          path: fileURLToPath(
            new URL('./fixtures/waverley-building.pbf', import.meta.url),
          ),
        }),
      );
      let loadedDem = false;
      page.on('response', (response) => {
        loadedDem ||=
          response.ok() && response.url().includes('/data/waverley-lidar/dem/');
      });
      await page.goto(
        '/?lat=55.9533&lng=-3.1883&aerialPreview=1' +
          (shaded ? '&buildings=shaded' : ''),
      );

      const map = page.getByTestId('parking-map');
      await expect(map).toHaveAttribute('data-map-aerial-buildings', 'on', {
        timeout: 15_000,
      });
      await expect(map).toHaveAttribute(
        'data-map-terrain',
        'neuk-waverley-terrain',
      );
      await expect.poll(() => loadedDem, { timeout: 15_000 }).toBe(true);
      await expect
        .poll(() => map.getAttribute('data-map-lidar-buildings').then(Number), {
          timeout: 25_000,
        })
        .toBeGreaterThan(0);
      await expect(map).toHaveAttribute('data-map-aerial-facades', 'shaded', {
        timeout: 15_000,
      });
      await expect(map).toHaveAttribute('data-map-aerial-roofs', 'materials');
      await expect(map).not.toHaveAttribute('data-map-roof-detail', 'aerial');
      await page
        .getByRole('button', { name: 'Collapse results panel' })
        .click();
      const badge = page.getByTestId('parking-marker-cec:178');
      await expect(badge).toHaveAttribute('data-model', 'stands');
      await expect(map).toHaveAttribute('data-parking-model-scale', '1');
      const zoom = () => map.getAttribute('data-map-zoom').then(Number);
      const initialZoom = await zoom();
      const initialBox = (await badge.boundingBox())!;
      const zoomIn = page.getByRole('button', { name: 'Zoom in', exact: true });
      for (let i = 0; i < 2; i++) {
        const before = await zoom();
        await zoomIn.tap();
        await expect.poll(zoom).toBeGreaterThan(before);
        await expect(map).toHaveAttribute('data-parking-model-scale', '1');
      }
      if (shaded) {
        await expect(map).toHaveAttribute('data-map-aerial-roofs', 'materials');
        await expect(map).not.toHaveAttribute('data-map-roof-detail', 'aerial');
        await expect(map).not.toHaveAttribute('data-map-roof-colors', 'aerial');
        await expect(map).not.toHaveAttribute(
          'data-map-princes-street-facades',
          'photo',
        );
        await expect(map).not.toHaveAttribute(
          'data-map-princes-street-roofs',
          'detail',
        );
      } else {
        await expect(map).toHaveAttribute('data-map-roof-detail', 'aerial', {
          timeout: 15_000,
        });
      }
      const closeBox = (await badge.boundingBox())!;
      expect(closeBox.width).toBe(initialBox.width);
      expect(closeBox.height).toBeGreaterThanOrEqual(44);
      const zoomOut = page.getByRole('button', {
        name: 'Zoom out',
        exact: true,
      });
      for (let i = 0; i < 3; i++) {
        const before = await zoom();
        await zoomOut.tap();
        await expect.poll(zoom).toBeLessThan(before);
      }
      await expect.poll(zoom).toBeLessThan(initialZoom);
      await expect(badge).toHaveAttribute('data-model', 'stands');
      await expect(badge).toHaveAttribute('data-model-group-size', '1');
      await expect(map).toHaveAttribute('data-parking-model-scale', '1');
      await badge.tap();
      await expect(badge).toHaveClass(/parking-marker-selected-ranked/);

      await page.getByRole('button', { name: 'Switch to 2D map' }).tap();
      await expect(map).not.toHaveAttribute('data-map-aerial-buildings', 'on');
      await expect(map).not.toHaveAttribute('data-map-lidar-buildings', /\d+/);
      await expect(map).toHaveAttribute('data-map-terrain', 'none');
      await expect(map).toHaveAttribute('data-map-satellite', 'ready');
    });
  }
});

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
