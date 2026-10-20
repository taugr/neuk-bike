import { expect, test, type Locator } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import {
  installOfflineMapFixture,
  expectRenderedBasemap,
} from './offline-map-fixtures';
import { installWindJourneyFixture, openWindJourney } from './wind-fixtures';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
async function expectPitch(map: Locator, pitch: number) {
  await expect
    // Match the terrain loader's readiness budget, including software WebGL.
    .poll(async () => Number(await map.getAttribute('data-map-pitch')), {
      timeout: 15_000,
    })
    .toBeCloseTo(pitch, 4);
}
const appUrl = '/?mockGps=55.9533,-3.1883,5';
const terrainPattern = 'https://elevation-tiles-prod.s3.amazonaws.com/**';
const tilePath = fileURLToPath(
  new URL('./fixtures/terrain.png', import.meta.url),
);

test.beforeEach(async ({ context }) => {
  await installOfflineMapFixture(context);
  await context.route(terrainPattern, (route) =>
    route.fulfill({ contentType: 'image/png', path: tilePath }),
  );
});

for (const satellite of [false, true]) {
  test(`rotated ${satellite ? 'satellite' : 'street'} terrain keeps parking visible and allows tilting and panning`, async ({
    page,
  }) => {
    // Multiple rendered drag gestures are slower with concurrent WebGL tests.
    test.slow();
    await page.setViewportSize({ width: 1440, height: 844 });
    await page.route('https://services.arcgisonline.com/**', (route) =>
      route.fulfill({ contentType: 'image/png', path: tilePath }),
    );
    await page.goto(appUrl);
    await expectRenderedBasemap(page);
    const map = page.getByTestId('parking-map');
    if (satellite) {
      await page.getByTestId('map-layers-trigger').click();
      await page
        .getByRole('switch', { name: 'Satellite', exact: true })
        .check();
      await page.getByTestId('map-layers-trigger').click();
      await expect(map).toHaveAttribute('data-map-satellite', 'ready');
    }
    await page.getByRole('button', { name: 'Switch to 3D map' }).click();
    await expectPitch(map, 55);
    await expect(map).toHaveAttribute('data-cycle-network-contrast', 'high');
    await page.mouse.move(700, 250);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(960, 300, { steps: 16 });
    await page.mouse.up({ button: 'right' });
    await expect
      .poll(async () => Number(await map.getAttribute('data-map-pitch')))
      .toBeLessThan(50);
    const expectParking = async () => {
      await expect
        .poll(async () =>
          map.evaluate((element) => {
            const d = (element as HTMLElement).dataset;
            return (
              Number(d.mapNorth) > Number(d.mapSouth) &&
              Number(d.mapEast) > Number(d.mapWest)
            );
          }),
        )
        .toBe(true);
      // Pinned nearby results alone hid the bug: require additional map pins.
      await expect
        .poll(async () =>
          page
            .locator('.parking-marker:not(.parking-marker-ranked)')
            .evaluateAll(
              (markers) =>
                markers.filter((marker) => {
                  const r = marker.getBoundingClientRect();
                  return (
                    r.x > 500 &&
                    r.right < innerWidth &&
                    r.y > 80 &&
                    r.bottom < innerHeight
                  );
                }).length,
            ),
        )
        .toBeGreaterThan(0);
    };
    await expectParking();
    const longitude = Number(
      await map.getAttribute('data-map-center-longitude'),
    );
    await page.mouse.move(800, 300);
    await page.mouse.down();
    await page.mouse.move(880, 360, { steps: 10 });
    await page.mouse.up();
    await expect
      .poll(async () =>
        Number(await map.getAttribute('data-map-center-longitude')),
      )
      .not.toBe(longitude);
    await expectParking();
    await page.getByRole('button', { name: 'Switch to 2D map' }).click();
    await expectPitch(map, 0);
    await expect(map).toHaveAttribute(
      'data-cycle-network-contrast',
      satellite ? 'high' : 'standard',
    );
    await page.mouse.move(700, 300);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(750, 230, { steps: 8 });
    await page.mouse.up({ button: 'right' });
    await expectPitch(map, 0);
  });
}

test('two-finger vertical dragging adjusts terrain pitch on a phone', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(appUrl);
  await page.getByRole('button', { name: 'Switch to 3D map' }).click();
  const map = page.getByTestId('parking-map');
  await expectPitch(map, 55);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: 150, y: 180 },
      { x: 230, y: 180 },
    ],
  });
  for (let step = 1; step <= 10; step++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: 150, y: 180 + step * 6 },
        { x: 230, y: 180 + step * 6 },
      ],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await cdp.detach();
  await expect
    .poll(async () => Number(await map.getAttribute('data-map-pitch')))
    .toBeLessThan(50);
});

test('slow elevation stays flat until ready and a pending tilt can be cancelled', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  let release: () => void = () => {};
  const tilesReady = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(terrainPattern, async (route) => {
    await tilesReady;
    await route.fulfill({ contentType: 'image/png', path: tilePath });
  });
  try {
    await page.goto(appUrl);
    await expectRenderedBasemap(page);
    const map = page.getByTestId('parking-map');
    await page.getByRole('button', { name: 'Switch to 3D map' }).click();
    await expect(map).toHaveAttribute('data-map-terrain', 'neuk-terrain');
    // Longer than the old animation: missing elevation must not leave us tilted.
    await page.waitForTimeout(900);
    await expectPitch(map, 0);
    await page.getByRole('button', { name: 'Switch to 2D map' }).click();
    await expect(map).toHaveAttribute('data-map-terrain', 'none');
    release();
    await page.getByRole('button', { name: 'Switch to 3D map' }).click();
    await expectPitch(map, 55);
    await page.getByRole('button', { name: 'Switch to 2D map' }).click();
    // Terrain remains while the camera eases down.
    await expect(map).toHaveAttribute('data-map-terrain', 'neuk-terrain');
    await expectPitch(map, 0);
    await expect(map).toHaveAttribute('data-map-terrain', 'none');
  } finally {
    release();
  }
});

for (const width of [320, 390, 1440]) {
  test(`terrain toggle preserves the camera and sits below the compass at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const requests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/terrarium/')) requests.push(request.url());
    });
    await page.goto(appUrl);
    await expectRenderedBasemap(page);
    const map = page.getByTestId('parking-map');
    const toggle = page.getByRole('button', { name: 'Switch to 3D map' });
    const compass = page.getByRole('button', {
      name: 'Reset bearing to north',
    });
    const box = (await toggle.boundingBox())!;
    const northBox = (await compass.boundingBox())!;
    expect(box.width).toBe(44);
    expect(box.height).toBe(44);
    expect(box.x).toBeCloseTo(northBox.x, 0);
    expect(box.y - northBox.y - northBox.height).toBeCloseTo(8, 0);
    expect(requests).toHaveLength(0);
    const zoom = await map.getAttribute('data-map-zoom');
    const lat = await map.getAttribute('data-map-center-latitude');
    const lng = await map.getAttribute('data-map-center-longitude');
    await toggle.click();
    await expectPitch(map, 55);
    await expect(map).toHaveAttribute('data-map-terrain', 'neuk-terrain');
    await expect.poll(() => requests.length).toBeGreaterThan(0);
    await expect
      .poll(async () => Number(await map.getAttribute('data-map-zoom')))
      .toBeCloseTo(Number(zoom), 5);
    await expect
      .poll(async () =>
        Number(await map.getAttribute('data-map-center-latitude')),
      )
      .toBeCloseTo(Number(lat), 5);
    await expect
      .poll(async () =>
        Number(await map.getAttribute('data-map-center-longitude')),
      )
      .toBeCloseTo(Number(lng), 5);
    await compass.click();
    await expectPitch(map, 55);
    await expect(page.locator('.parking-marker').first()).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('button', { name: 'Switch to 2D map' }),
    ).toBeEnabled();
    await expect(map).toHaveAttribute('data-map-terrain', 'neuk-terrain');
    await expectPitch(map, 55);
    await page.getByRole('button', { name: 'Switch to 2D map' }).click();
    await expectPitch(map, 0);
    await expect(map).toHaveAttribute('data-map-terrain', 'none');
    await page.reload();
    await expectRenderedBasemap(page);
    await expect(
      page.getByRole('button', { name: 'Switch to 3D map' }),
    ).toBeEnabled();
  });
}

test('preserves 3D through theme changes and route framing, and respects a switch back during a route', async ({
  page,
}) => {
  await installWindJourneyFixture(page);
  await page.goto(appUrl);
  await page.getByRole('button', { name: 'Switch to 3D map' }).click();
  const map = page.getByTestId('parking-map');
  await expectPitch(map, 55);
  await page
    .getByRole('button', { name: 'Theme settings', exact: true })
    .click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(map).toHaveClass(/bike-map-dark/);
  await expect(map).toHaveAttribute('data-map-terrain', 'neuk-terrain');
  await expectPitch(map, 55);
  await openWindJourney(page);
  await expect(map).toHaveAttribute('data-route-source', 'cyclestreets');
  await expectPitch(map, 55);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Start route', exact: true }).click();
  await expect(page.getByTestId('live-route-marker')).toBeVisible();
  await expect(page.getByTestId('ride-guidance')).toBeVisible();
  await expectPitch(map, 55);
  await expect(map).toHaveAttribute('data-map-terrain', 'neuk-terrain');
  await page.getByRole('button', { name: 'Switch to 2D map' }).click();
  await expectPitch(map, 0);
  await expect(page.getByTestId('live-route-marker')).toBeVisible();
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.getByTestId('live-route-marker')).toHaveCount(0);
  await page.getByRole('button', { name: 'Back to nearby neuks' }).click();
  await expectPitch(map, 0);
  await expect(map).toHaveAttribute('data-map-terrain', 'none');
});

test('parking routes show only the destination model at close zoom and keep their finish marker', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 820 });
  await page.route(
    'https://api.cyclestreets.net/v2/journey.plan*',
    async (request) => {
      const url = new URL(request.request().url());
      const coordinates = url.searchParams
        .get('waypoints')!
        .split('|')
        .map((point) => point.split(',').slice(0, 2).map(Number));
      await request.fulfill({
        contentType: 'application/javascript',
        body: `${url.searchParams.get('callback')}(${JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { path: 'plan/balanced', plan: 'balanced', lengthMetres: 150, timeSeconds: 60 }, geometry: { type: 'LineString', coordinates } }] })});`,
      });
    },
  );
  await page.goto(appUrl);
  await expectRenderedBasemap(page);
  await page
    .getByTestId('parking-list')
    .getByRole('button', {
      name: 'Waverley drop-off point near Calton Road',
      exact: true,
    })
    .first()
    .click();
  await page
    .getByRole('button', {
      name: 'Show cycle directions to Waverley drop-off point near Calton Road',
      exact: true,
    })
    .first()
    .click();
  await expect(
    page.getByRole('button', { name: 'Start route', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Switch to 3D map' }).click();
  const map = page.getByTestId('parking-map');
  while (Number(await map.getAttribute('data-map-zoom')) < 18) {
    const zoom = Number(await map.getAttribute('data-map-zoom'));
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await expect
      .poll(async () => Number(await map.getAttribute('data-map-zoom')))
      .toBeCloseTo(zoom + 1, 1);
  }
  await expect(map).toHaveAttribute('data-parking-model-features', '1');
  await expect(page.locator('.route-waypoint-marker-finish')).toBeVisible();
  await expect(page.locator('.route-waypoint-marker-finish')).toHaveClass(
    /route-destination-model-badge/,
  );
  await page
    .getByRole('button', {
      name: /^Arrive at Waverley drop-off point near Calton Road/,
    })
    .click();
  await expect(page.locator('.route-waypoint-marker-finish')).toHaveClass(
    /route-destination-arrival-selected/,
  );
  await expect(
    page.locator('.selected-route-instruction-marker-arrive'),
  ).toHaveCount(0);
  await expect(page.locator('.parking-marker')).toHaveCount(0);
  await page.getByRole('button', { name: 'Start route', exact: true }).click();
  await expect(page.getByTestId('live-route-marker')).toBeVisible();
  await expect(map).toHaveAttribute('data-parking-model-features', '1');
  await page.getByRole('button', { name: 'Switch to 2D map' }).click();
  await expect(map).toHaveAttribute('data-parking-model-features', '0');
  await expect(page.locator('.route-waypoint-marker-finish')).toBeVisible();
  await expect(page.locator('.route-waypoint-marker-finish')).not.toHaveClass(
    /route-destination-model-badge/,
  );
  await page.getByRole('button', { name: 'Switch to 3D map' }).click();
  // Guidance follows the start location; bring the destination back into view.
  await page
    .getByRole('button', {
      name: /^Arrive at Waverley drop-off point near Calton Road/,
    })
    .click();
  await expect(map).toHaveAttribute('data-parking-model-features', '1');
  while (Number(await map.getAttribute('data-map-zoom')) >= 17) {
    const zoom = Number(await map.getAttribute('data-map-zoom'));
    await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
    await expect
      .poll(async () => Number(await map.getAttribute('data-map-zoom')))
      .toBeCloseTo(zoom - 1, 1);
  }
  await expect(map).toHaveAttribute('data-parking-model-features', '0');
  await expect(page.locator('.route-waypoint-marker-finish')).toBeVisible();
});

test('failed elevation returns to 2D without losing the basemap and can be retried', async ({
  page,
}) => {
  await page.route(terrainPattern, (route) => route.abort());
  await page.goto(appUrl);
  await page.getByRole('button', { name: 'Switch to 3D map' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: '3D terrain unavailable' }),
  ).toBeVisible();
  const map = page.getByTestId('parking-map');
  await expectPitch(map, 0);
  await expect(map).toHaveAttribute('data-map-terrain', 'none');
  await expectRenderedBasemap(page);
  await page.unroute(terrainPattern);
  await page.getByRole('button', { name: 'Switch to 3D map' }).click();
  await expectPitch(map, 55);
  await expect(map).toHaveAttribute('data-map-terrain', 'neuk-terrain');
  await expect(page.locator('.terrain-unavailable-notice')).toHaveCount(0);
});

test('going offline returns to 2D and keeps the current parking results', async ({
  page,
  context,
}) => {
  await page.goto(appUrl);
  await page.getByRole('button', { name: 'Switch to 3D map' }).click();
  await expectPitch(page.getByTestId('parking-map'), 55);
  await context.setOffline(true);
  await expectPitch(page.getByTestId('parking-map'), 0);
  await expect(
    page.getByRole('button', { name: 'Switch to 3D map' }),
  ).toBeEnabled();
  await expect(page.locator('.parking-marker').first()).toBeVisible();
});

test('restores terrain and parking after WebGL context recovery', async ({
  page,
}) => {
  await page.goto(appUrl);
  await page.getByRole('button', { name: 'Switch to 3D map' }).click();
  const map = page.getByTestId('parking-map');
  await expectPitch(map, 55);
  await page.evaluate(async () => {
    const canvas =
      document.querySelector<HTMLCanvasElement>('.maplibregl-canvas')!;
    const extension = canvas
      .getContext('webgl2')!
      .getExtension('WEBGL_lose_context')!;
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
  await expect(map).toHaveAttribute('data-map-terrain', 'neuk-terrain');
  await expectPitch(map, 55);
  await expect(
    page.getByRole('button', { name: 'Switch to 2D map' }),
  ).toBeEnabled();
  await expect(page.locator('.parking-marker').first()).toBeVisible();
});

test('the toggle still works when preference storage is unavailable', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const get = Storage.prototype.getItem;
    const set = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key) {
      if (key === 'bike-neuk-map-3d') throw new Error('Storage unavailable');
      return get.call(this, key);
    };
    Storage.prototype.setItem = function (key, value) {
      if (key === 'bike-neuk-map-3d') throw new Error('Storage unavailable');
      return set.call(this, key, value);
    };
  });
  await page.goto(appUrl);
  await page.getByRole('button', { name: 'Switch to 3D map' }).click();
  await expectPitch(page.getByTestId('parking-map'), 55);
  await page.getByRole('button', { name: 'Switch to 2D map' }).click();
  await expectPitch(page.getByTestId('parking-map'), 0);
});

test('stalled elevation requests time out to a usable flat map', async ({
  page,
}) => {
  let release: () => void = () => {};
  const stalled = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(terrainPattern, async (route) => {
    await stalled;
    await route.abort();
  });
  try {
    await page.goto(appUrl);
    await expectRenderedBasemap(page);
    await page.clock.install();
    await page.getByRole('button', { name: 'Switch to 3D map' }).click();
    await expect(page.getByTestId('parking-map')).toHaveAttribute(
      'data-map-terrain',
      'neuk-terrain',
    );
    await page.clock.fastForward(16_000);
    await expect(page.locator('.terrain-unavailable-notice')).toBeVisible();
    await expectPitch(page.getByTestId('parking-map'), 0);
    await expectRenderedBasemap(page);
  } finally {
    release();
  }
});

test('close zoom models retain keyboard selection, restore pins, and survive style changes', async ({
  page,
}) => {
  await page.goto(appUrl);
  await expectRenderedBasemap(page);
  await page.getByRole('button', { name: 'Switch to 3D map' }).click();
  const map = page.getByTestId('parking-map');
  while (Number(await map.getAttribute('data-map-zoom')) < 17) {
    const zoom = Number(await map.getAttribute('data-map-zoom'));
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await expect
      .poll(async () => Number(await map.getAttribute('data-map-zoom')))
      .toBeCloseTo(zoom + 1, 1);
  }
  const model = page
    .locator('.parking-marker-model[data-model="stands"]')
    .first();
  await expect(model).toBeVisible();
  await expect
    .poll(async () =>
      Number(await map.getAttribute('data-parking-model-features')),
    )
    .toBeGreaterThan(0);
  await model.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.maplibregl-popup')).toBeVisible();
  await page
    .getByRole('button', { name: 'Theme settings', exact: true })
    .click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(map).toHaveClass(/bike-map-dark/);
  await expect(model).toBeVisible();
  await expect
    .poll(async () =>
      Number(await map.getAttribute('data-parking-model-features')),
    )
    .toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Switch to 2D map' }).click();
  await expect(page.locator('.parking-marker-model')).toHaveCount(0);
  await page.getByRole('button', { name: 'Switch to 3D map' }).click();
  await expect(model).toBeVisible();
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await expect(page.locator('.parking-marker-model')).toHaveCount(0);
});

test('recreates smooth model buffers after losing the WebGL context at close zoom', async ({
  page,
}) => {
  await page.goto(appUrl);
  await expectRenderedBasemap(page);
  await page.getByRole('button', { name: 'Switch to 3D map' }).click();
  const map = page.getByTestId('parking-map');
  while (Number(await map.getAttribute('data-map-zoom')) < 18) {
    const zoom = Number(await map.getAttribute('data-map-zoom'));
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await expect
      .poll(async () => Number(await map.getAttribute('data-map-zoom')))
      .toBeCloseTo(zoom + 1, 1);
  }
  await expect
    .poll(async () =>
      Number(await map.getAttribute('data-parking-model-features')),
    )
    .toBeGreaterThan(0);
  await page.evaluate(async () => {
    const canvas =
      document.querySelector<HTMLCanvasElement>('.maplibregl-canvas')!;
    const extension = canvas
      .getContext('webgl2')!
      .getExtension('WEBGL_lose_context')!;
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
  await expect
    .poll(async () =>
      Number(await map.getAttribute('data-parking-model-features')),
    )
    .toBeGreaterThan(0);
  await expect(page.locator('.parking-marker-model').first()).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath('smooth-model-recovery.png'),
  });
});

test('Waverley shows separate bounded models with individually selectable buttons', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    localStorage.setItem('cycle-parking-cycle-network-visible', 'false');
  });
  await page.goto(appUrl);
  await expectRenderedBasemap(page);
  const ids = ['cec:143', 'osm:node:13043142711', 'osm:node:13043142710'];
  const buttons = ids.map((id) => page.getByTestId(`parking-marker-${id}`));
  const style = () =>
    buttons[1]
      .locator('span')
      .first()
      .evaluate((element) => {
        const css = getComputedStyle(element);
        return [
          css.width,
          css.height,
          css.backgroundColor,
          css.border,
          css.color,
          css.fontSize,
        ];
      });
  const originalStyle = await style();
  await buttons[0].click();
  await page.getByRole('button', { name: 'Switch to 3D map' }).click();
  const map = page.getByTestId('parking-map');
  while (Number(await map.getAttribute('data-map-zoom')) < 19) {
    const zoom = Number(await map.getAttribute('data-map-zoom'));
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await expect
      .poll(async () => Number(await map.getAttribute('data-map-zoom')))
      .toBeCloseTo(zoom + 1, 1);
  }
  // Centre the middle site at the final zoom; the preceding zoom controls keep
  // the camera centre fixed and can otherwise move the northern site offscreen.
  await page
    .getByRole('list', { name: 'Nearby bike neuks' })
    .getByRole('button', {
      name: 'Waverley drop-off point near Calton Road',
      exact: true,
    })
    .nth(2)
    .click();
  await expect(buttons[2]).toHaveClass(/parking-marker-selected-ranked/);
  for (const button of buttons) {
    await expect(button).toHaveAttribute('data-model-group-size', '1');
    expect(
      Number(await button.getAttribute('data-model-offset-metres')),
    ).toBeLessThanOrEqual(8.001);
  }
  // Use a protected numbered neighbour: ordinary pins can be decluttered.
  await expect(page.getByTestId('parking-marker-cec:178')).toHaveAttribute(
    'data-model-group-size',
    '1',
  );
  expect(await style()).toEqual(originalStyle);
  await expect
    .poll(async () => {
      const boxes = await Promise.all(
        buttons.map((button) => button.boundingBox()),
      );
      if (boxes.some((box) => !box)) return false;
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i]!,
            b = boxes[j]!;
          if (
            !(
              a.x + a.width <= b.x ||
              b.x + b.width <= a.x ||
              a.y + a.height <= b.y ||
              b.y + b.height <= a.y
            )
          )
            return false;
        }
      return true;
    })
    .toBe(true);
  await expect
    .poll(async () => {
      const bounds = await Promise.all(
        buttons.map(async (button) =>
          JSON.parse((await button.getAttribute('data-model-bounds'))!),
        ),
      );
      const collisions = [];
      for (let i = 0; i < bounds.length; i++)
        for (let j = i + 1; j < bounds.length; j++) {
          const a = bounds[i],
            b = bounds[j];
          if (
            !(
              a.right <= b.left ||
              b.right <= a.left ||
              a.bottom <= b.top ||
              b.bottom <= a.top
            )
          )
            collisions.push([ids[i], ids[j], a, b]);
        }
      return collisions;
    })
    .toEqual([]);
  await page.mouse.click(40, 850);
  await expect(page.locator('.maplibregl-popup')).toHaveCount(0);
  const meshBounds = JSON.parse(
    (await buttons[1].getAttribute('data-model-bounds'))!,
  );
  await page.mouse.click(
    (meshBounds.left + meshBounds.right) / 2,
    meshBounds.top + (meshBounds.bottom - meshBounds.top) * 0.25,
  );
  await expect(buttons[1]).toHaveClass(/parking-marker-selected-ranked/);
  for (const button of buttons) {
    // Wait for popup centring before clicking the background. MapLibre ignores
    // a pointer click during its animated pan, so an immediate click can be lost.
    let lastCenter = '';
    let stableSamples = 0;
    await expect
      .poll(
        async () => {
          const center = await map.getAttribute('data-map-center-latitude');
          stableSamples = center === lastCenter ? stableSamples + 1 : 0;
          lastCenter = center ?? '';
          return stableSamples;
        },
        { intervals: [250], timeout: 5000 },
      )
      .toBeGreaterThanOrEqual(3);
    await page.mouse.click(40, 850);
    await expect(page.locator('.maplibregl-popup')).toHaveCount(0);
    await button.click();
    await expect(button).toHaveClass(/parking-marker-selected-ranked/);
    await expect(page.locator('.maplibregl-popup')).toBeVisible();
  }
  await page.getByRole('button', { name: 'Switch to 2D map' }).click();
  for (const button of buttons)
    await expect(button).not.toHaveAttribute('data-model-group');
});

test('new type aliases render distinct models and retain individual selection', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const examples = [
    { id: 'cec:178', type: ' POST HOOP ', kind: 'post-hoop' },
    { id: 'cec:43', type: 'two_tier', kind: 'two-tier' },
    { id: 'cec:1320', type: 'vertical_stands', kind: 'vertical' },
    { id: 'cec:143', type: 'wave', kind: 'wave' },
    { id: 'cec:1237', type: 'flower_pots', kind: 'planter' },
    { id: 'cec:1238', type: 'bike_dock', kind: 'dock' },
    { id: 'osm:node:13043142711', type: 'hoops_on_benches', kind: 'bench' },
    { id: 'osm:node:13043142710', type: 'street_lamp', kind: 'lamp' },
  ];
  await page.route('**/data/parking/chunks/**', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    for (const point of Array.isArray(data) ? data : data.points) {
      const example = examples.find((item) => item.id === point.id);
      if (example) point.properties.bicycle_pa = example.type;
    }
    await route.fulfill({ response, json: data });
  });
  await page.goto(appUrl);
  await expectRenderedBasemap(page);
  await page.getByRole('button', { name: 'Switch to 3D map' }).click();
  const map = page.getByTestId('parking-map');
  while (Number(await map.getAttribute('data-map-zoom')) < 18) {
    const zoom = Number(await map.getAttribute('data-map-zoom'));
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await expect
      .poll(async () => Number(await map.getAttribute('data-map-zoom')))
      .toBeCloseTo(zoom + 1, 1);
  }
  for (const example of examples) {
    await expect(
      page.getByTestId(`parking-marker-${example.id}`),
    ).toHaveAttribute('data-model', example.kind);
  }
  await expect
    .poll(async () =>
      Number(await map.getAttribute('data-parking-model-features')),
    )
    .toBeGreaterThan(0);
  const postHoop = page.getByTestId('parking-marker-cec:178');
  await postHoop.focus();
  await page.keyboard.press('Enter');
  await expect(postHoop).toHaveClass(/parking-marker-selected-ranked/);
  await expect(page.locator('.maplibregl-popup')).toBeVisible();
});
