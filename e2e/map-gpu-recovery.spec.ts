import { expect, test, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { installOfflineMapFixture } from './offline-map-fixtures';
import { installWindJourneyFixture } from './wind-fixtures';

// Reuse Next's image decoder, as the brand-asset script does; no new dependency.
const require = createRequire(import.meta.url);
const sharp = createRequire(require.resolve('next/package.json'))('sharp');
const appUrl = '/?mockGps=55.9533,-3.1883,5';
const terrainTile = fileURLToPath(
  new URL('./fixtures/terrain.png', import.meta.url),
);
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });

test.beforeEach(async ({ context }) => {
  await installOfflineMapFixture(context);
  const blueTile = await sharp({
    create: {
      width: 256,
      height: 256,
      channels: 4,
      background: '#107195',
    },
  })
    .png()
    .toBuffer();
  await context.route('https://services.arcgisonline.com/**', (route) =>
    route.fulfill({ contentType: 'image/png', body: blueTile }),
  );
  await context.route(
    'https://elevation-tiles-prod.s3.amazonaws.com/**',
    (route) => route.fulfill({ contentType: 'image/png', path: terrainTile }),
  );
});

async function camera(page: Page) {
  return page.getByTestId('parking-map').evaluate((element) => {
    const d = (element as HTMLElement).dataset;
    return {
      latitude: Number(d.mapCenterLatitude),
      longitude: Number(d.mapCenterLongitude),
      zoom: Number(d.mapZoom),
      pitch: Number(d.mapPitch),
    };
  });
}

async function ready(page: Page) {
  await expect(page.getByTestId('parking-map')).toHaveAttribute(
    'data-map-initializing',
    'false',
    { timeout: 20_000 },
  );
  await expect(page.getByTestId('parking-map')).toHaveAttribute(
    'data-map-satellite',
    'ready',
    { timeout: 20_000 },
  );
  // Attributes update at camera moveend. Also let any popup centring finish.
  let last = '';
  let stable = 0;
  await expect
    .poll(
      async () => {
        const next = JSON.stringify(await camera(page));
        stable = next === last ? stable + 1 : 0;
        last = next;
        return stable;
      },
      { intervals: [300], timeout: 15_000 },
    )
    .toBeGreaterThanOrEqual(4);
}

async function expectBlueImagery(page: Page) {
  // Feature counts and console health cannot detect a glyph atlas painted as
  // imagery. Check actual screenshot pixels as well as normal map interaction.
  await expect
    .poll(
      async () => {
        const shot = await page.locator('.maplibregl-canvas').screenshot();
        const { data, info } = await sharp(shot)
          .removeAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        let blue = 0;
        for (let i = 0; i < data.length; i += info.channels)
          if (
            data[i] < 50 &&
            data[i + 1] > 80 &&
            data[i + 2] > data[i + 1] + 20
          )
            blue++;
        return blue / (info.width * info.height);
      },
      { timeout: 15_000 },
    )
    .toBeGreaterThan(0.55);
}

async function resetGpu(page: Page) {
  const oldCanvas = await page.locator('.maplibregl-canvas').elementHandle();
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
  // A different canvas guarantees old GPU pools cannot feed the replacement.
  await expect
    .poll(() => oldCanvas!.evaluate((canvas) => canvas.isConnected), {
      timeout: 20_000,
    })
    .toBe(false);
  await ready(page);
  await expectBlueImagery(page);
}

for (const terrain of [false, true]) {
  test(`satellite pixels, camera and selection survive repeated GPU resets in ${terrain ? '3D' : '2D'}`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.addInitScript((terrain) => {
      localStorage.setItem('bike-neuk-map-3d', String(terrain));
      localStorage.setItem('bike-neuk-map-satellite', 'true');
    }, terrain);
    await page.goto(appUrl);
    await ready(page);
    await page.getByTestId('parking-marker-cec:178').click();
    await expect(page.locator('.maplibregl-popup')).toBeVisible();
    await ready(page);
    const original = await camera(page);
    await expectBlueImagery(page);
    for (let i = 0; i < 2; i++) {
      await resetGpu(page);
      const current = await camera(page);
      for (const key of ['latitude', 'longitude', 'zoom', 'pitch'] as const)
        expect(current[key]).toBeCloseTo(original[key], 5);
      await expect(page.locator('.maplibregl-popup')).toContainText(
        'Princes Street by Waverley Steps',
      );
      await expect(page.getByTestId('parking-marker-cec:178')).toHaveClass(
        /parking-marker-selected-ranked/,
      );
      if (terrain)
        await expect
          .poll(async () =>
            Number(
              await page
                .getByTestId('parking-map')
                .getAttribute('data-parking-model-features'),
            ),
          )
          .toBeGreaterThan(0);
    }
    await page.screenshot({
      path: test.info().outputPath('recovered-satellite.png'),
    });
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await expect
      .poll(async () => (await camera(page)).zoom)
      .toBeCloseTo(original.zoom + 1, 1);
  });
}

test('GPU recovery preserves dark theme and active ride guidance without reloading the page', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    localStorage.setItem('bike-neuk-map-3d', 'true');
    localStorage.setItem('bike-neuk-map-satellite', 'true');
  });
  await installWindJourneyFixture(page);
  await page.goto(appUrl);
  await ready(page);
  await page
    .getByRole('button', { name: 'Theme settings', exact: true })
    .click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await page.keyboard.press('Escape');
  await ready(page);
  await page
    .getByRole('button', { name: /^(Plan a route|Resume route)$/ })
    .click();
  await page
    .getByRole('combobox', { name: 'Search destination' })
    .fill('Wind test');
  await page.getByRole('option').click();
  await page.getByRole('button', { name: 'Start route', exact: true }).click();
  await expect(page.getByTestId('ride-guidance')).toBeVisible();
  await ready(page);
  const original = await camera(page);
  const timeOrigin = await page.evaluate(() => performance.timeOrigin);
  await resetGpu(page);
  const current = await camera(page);
  for (const key of ['latitude', 'longitude', 'zoom', 'pitch'] as const)
    expect(current[key]).toBeCloseTo(original[key], 5);
  await expect(page.getByTestId('parking-map')).toHaveClass(/bike-map-dark/);
  await expect(page.getByTestId('parking-map')).toHaveAttribute(
    'data-route-source',
    'cyclestreets',
  );
  await expect(page.getByTestId('ride-guidance')).toBeVisible();
  await expect(page.getByTestId('live-route-marker')).toBeVisible();
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(timeOrigin);
});
