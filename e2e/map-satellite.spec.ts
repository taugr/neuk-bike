import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import {
  installOfflineMapFixture,
  expectRenderedBasemap,
} from './offline-map-fixtures';
import { installWindJourneyFixture, openWindJourney } from './wind-fixtures';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
const appUrl = '/?mockGps=55.9533,-3.1883,5';
const imageryPattern =
  'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/**';
const tilePath = fileURLToPath(
  new URL('./fixtures/terrain.png', import.meta.url),
);

test.beforeEach(async ({ context }) => {
  await installOfflineMapFixture(context);
  await context.route(imageryPattern, (route) =>
    route.fulfill({ contentType: 'image/png', path: tilePath }),
  );
  await context.route(
    'https://elevation-tiles-prod.s3.amazonaws.com/**',
    (route) => route.fulfill({ contentType: 'image/png', path: tilePath }),
  );
});

for (const [satellite, terrain] of [
  [true, false],
  [true, true],
  [false, true],
]) {
  test(`saved ${satellite ? 'satellite' : 'street'} starts in ${terrain ? '3D' : '2D'} without a mode transition`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.addInitScript(
      ({ satellite, terrain }) => {
        localStorage.setItem('bike-neuk-map-satellite', String(satellite));
        localStorage.setItem('bike-neuk-map-3d', String(terrain));
        const frames: { satellite: string | undefined; pitch: number }[] = [];
        Object.assign(window, { startupMapFrames: frames });
        const sample = () => {
          const map = document.querySelector<HTMLElement>('.bike-map');
          const canvas = map?.querySelector('canvas');
          if (canvas && getComputedStyle(canvas).visibility === 'visible') {
            frames.push({
              satellite: map?.dataset.mapSatellite,
              pitch: Number(map?.dataset.mapPitch),
            });
          }
          requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      },
      { satellite, terrain },
    );
    let release: () => void = () => {};
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    let requested = false;
    await page.route(
      satellite
        ? imageryPattern
        : 'https://elevation-tiles-prod.s3.amazonaws.com/**',
      async (route) => {
        requested = true;
        await waiting;
        await route.fulfill({ contentType: 'image/png', path: tilePath });
      },
    );
    try {
      await page.goto(appUrl);
      const map = page.getByTestId('parking-map');
      await expect.poll(() => requested).toBe(true);
      await expect(map).toHaveAttribute('data-map-initializing', 'true');
      await expect(page.locator('.maplibregl-canvas')).toBeHidden();
      release();
      // Match the terrain/imagery readiness budget, including software WebGL.
      await expect(map).toHaveAttribute('data-map-initializing', 'false', {
        timeout: 15_000,
      });
      await expect(page.locator('.maplibregl-canvas')).toBeVisible();
      await expect
        .poll(async () =>
          page.evaluate(
            () =>
              (window as unknown as { startupMapFrames: unknown[] })
                .startupMapFrames.length,
          ),
        )
        .toBeGreaterThan(0);
      const frames = await page.evaluate(
        () =>
          (
            window as unknown as {
              startupMapFrames: { satellite: string; pitch: number }[];
            }
          ).startupMapFrames,
      );
      expect(
        frames.every(
          (frame) => frame.satellite === (satellite ? 'ready' : 'off'),
        ),
      ).toBe(true);
      expect(
        frames.every(
          (frame) => Math.abs(frame.pitch - (terrain ? 55 : 0)) < 0.01,
        ),
      ).toBe(true);
    } finally {
      release();
    }
  });
}

test('saved satellite falls back visibly when imagery fails at startup', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem('bike-neuk-map-satellite', 'true'),
  );
  await page.route(imageryPattern, (route) => route.fulfill({ status: 503 }));
  await page.goto(appUrl);
  await expect(page.getByTestId('parking-map')).toHaveAttribute(
    'data-map-initializing',
    'false',
  );
  await expectRenderedBasemap(page);
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
});

for (const width of [320, 390, 1440]) {
  test(`satellite preserves camera, credits, overlays and preference at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width, height: 844 });
    const requests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/World_Imagery/'))
        requests.push(request.url());
    });
    await page.goto(appUrl);
    await expectRenderedBasemap(page);
    expect(requests).toHaveLength(0);
    const map = page.getByTestId('parking-map');
    await expect(map).toHaveAttribute(
      'data-cycle-network-contrast',
      'standard',
    );
    const camera = await map.evaluate((el) => [
      el.getAttribute('data-map-center-latitude'),
      el.getAttribute('data-map-center-longitude'),
      el.getAttribute('data-map-zoom'),
    ]);
    await page.getByRole('button', { name: 'Map layers', exact: true }).click();
    const toggle = page.getByRole('switch', { name: 'Satellite', exact: true });
    await toggle.check();
    await expect(map).toHaveAttribute('data-map-satellite', 'ready');
    await expect(map).toHaveAttribute('data-cycle-network-contrast', 'high');
    expect(
      await map.evaluate((el) => [
        el.getAttribute('data-map-center-latitude'),
        el.getAttribute('data-map-center-longitude'),
        el.getAttribute('data-map-zoom'),
      ]),
    ).toEqual(camera);
    const credits = page.locator('.maplibregl-ctrl-attrib');
    await expect(credits).toContainText('Esri');
    await expect(page.getByText('Online imagery · Esri')).toHaveCount(0);
    await expect(credits).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(page.locator('.parking-marker').first()).toBeVisible();
    // Satellite uses the same five-second startup fade as the street map.
    await expect(credits).toHaveCSS('opacity', '0', { timeout: 8_000 });
    await expect(credits).toBeHidden();
    await page.reload();
    await expect(map).toHaveAttribute('data-map-satellite', 'ready');
    await page.getByRole('button', { name: 'Map layers', exact: true }).click();
    await expect(toggle).toBeChecked();
    await toggle.uncheck();
    await expect(map).toHaveAttribute('data-map-satellite', 'off');
    await expect(map).toHaveAttribute(
      'data-cycle-network-contrast',
      'standard',
    );
    await expectRenderedBasemap(page);
  });
}

test('satellite survives 3D, theme changes and route framing', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await installWindJourneyFixture(page);
  await page.goto(appUrl);
  await expectRenderedBasemap(page);
  const map = page.getByTestId('parking-map');
  await page.getByRole('button', { name: 'Map layers', exact: true }).click();
  await page.getByRole('switch', { name: 'Satellite', exact: true }).check();
  await page.keyboard.press('Escape');
  await expect(map).toHaveAttribute('data-map-satellite', 'ready');
  await page.getByRole('button', { name: 'Switch to 3D map' }).click();
  await expect
    .poll(async () => Number(await map.getAttribute('data-map-pitch')))
    .toBeCloseTo(55, 4);
  await page
    .getByRole('button', { name: 'Theme settings', exact: true })
    .click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(map).toHaveClass(/bike-map-dark/);
  await expect(map).toHaveAttribute('data-map-satellite', 'ready');
  await openWindJourney(page);
  await expect(map).toHaveAttribute('data-route-source', 'cyclestreets');
  await expect
    .poll(async () => Number(await map.getAttribute('data-map-pitch')))
    .toBeCloseTo(55, 4);
  await expect(map).toHaveAttribute('data-map-satellite', 'ready');
  await page.getByRole('button', { name: 'Map layers', exact: true }).click();
  await page.getByRole('switch', { name: 'Satellite', exact: true }).uncheck();
  await expect(map).toHaveAttribute('data-map-satellite', 'off');
  await expect(map).toHaveAttribute('data-route-source', 'cyclestreets');
});

test('failed imagery restores the street map and can be retried', async ({
  page,
}) => {
  await page.route(imageryPattern, (route) => route.fulfill({ status: 503 }));
  await page.goto(appUrl);
  await expectRenderedBasemap(page);
  await page.getByRole('button', { name: 'Map layers', exact: true }).click();
  const toggle = page.getByRole('switch', { name: 'Satellite', exact: true });
  await toggle.check();
  await expect(
    page.getByRole('status').filter({ hasText: 'Satellite unavailable' }),
  ).toBeVisible();
  await expect(toggle).not.toBeChecked();
  await expectRenderedBasemap(page);
  await page.unroute(imageryPattern);
  await toggle.check();
  await expect(page.getByTestId('parking-map')).toHaveAttribute(
    'data-map-satellite',
    'ready',
  );
});

test('going offline falls back without losing parking', async ({
  page,
  context,
}) => {
  await page.goto(appUrl);
  await expectRenderedBasemap(page);
  await page.getByRole('button', { name: 'Map layers', exact: true }).click();
  await page.getByRole('switch', { name: 'Satellite', exact: true }).check();
  await expect(page.getByTestId('parking-map')).toHaveAttribute(
    'data-map-satellite',
    'ready',
  );
  await context.setOffline(true);
  await expect(page.getByTestId('parking-map')).toHaveAttribute(
    'data-map-satellite',
    'off',
  );
  await expect(page.locator('.parking-marker').first()).toBeVisible();
});

test('a cancelled slow load cannot switch the map back to satellite', async ({
  page,
}) => {
  let release: () => void = () => {};
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(imageryPattern, async (route) => {
    await waiting;
    await route.fulfill({ contentType: 'image/png', path: tilePath });
  });
  try {
    await page.goto(appUrl);
    await expectRenderedBasemap(page);
    await page.getByRole('button', { name: 'Map layers', exact: true }).click();
    const toggle = page.getByRole('switch', { name: 'Satellite', exact: true });
    await toggle.check();
    await expect(page.getByTestId('parking-map')).toHaveAttribute(
      'data-map-satellite',
      'loading',
    );
    await expectRenderedBasemap(page);
    await toggle.uncheck();
    release();
    await expect(page.getByTestId('parking-map')).toHaveAttribute(
      'data-map-satellite',
      'off',
    );
    await expectRenderedBasemap(page);
  } finally {
    release();
  }
});

test('stalled imagery times out to the street map', async ({ page }) => {
  let release: () => void = () => {};
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(imageryPattern, async (route) => {
    await waiting;
    await route.abort();
  });
  try {
    await page.goto(appUrl);
    await expectRenderedBasemap(page);
    await page.clock.install();
    await page.getByRole('button', { name: 'Map layers', exact: true }).click();
    await page.getByRole('switch', { name: 'Satellite', exact: true }).check();
    await expect(page.getByTestId('parking-map')).toHaveAttribute(
      'data-map-satellite',
      'loading',
    );
    await page.clock.fastForward(16_000);
    await expect(
      page.getByRole('status').filter({ hasText: 'Satellite unavailable' }),
    ).toBeVisible();
    await expect(page.getByTestId('parking-map')).toHaveAttribute(
      'data-map-satellite',
      'off',
    );
    await expectRenderedBasemap(page);
  } finally {
    release();
  }
});
