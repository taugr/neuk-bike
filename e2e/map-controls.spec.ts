import { expect, test } from '@playwright/test';
import { installOfflineMapFixture } from './offline-map-fixtures';

test.use({ hasTouch: true });

test.beforeEach(async ({ context }) => {
  await installOfflineMapFixture(context);
});

for (const width of [320, 390, 1440]) {
  test(`rotates with the compass and resets north at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/?mockGps=55.9533,-3.1883,5');
    const compass = page.getByRole('button', {
      name: 'Reset bearing to north',
    });
    const icon = compass.locator('.maplibregl-ctrl-icon');
    await expect(compass).toBeVisible();
    const box = (await compass.boundingBox())!;
    const layers = (await page
      .getByTestId('map-layers-trigger')
      .boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(Math.abs(box.x - layers.x)).toBeLessThan(1);
    expect(box.y - layers.y - layers.height).toBeCloseTo(8, 0);
    await page.mouse.move(box.x + box.width / 2, box.y + 8);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 40, box.y + 8, { steps: 8 });
    await page.mouse.up();
    await expect(icon).not.toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
    await compass.click();
    await expect(icon).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');

    const canvas = (await page.locator('.maplibregl-canvas').boundingBox())!;
    const x = canvas.x + canvas.width / 2;
    const y = canvas.y + 220;
    if (width <= 820) {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [
          { x: x - 45, y },
          { x: x + 45, y },
        ],
      });
      for (let step = 1; step <= 8; step++) {
        const angle = (step * Math.PI) / 32;
        const dx = 45 * Math.cos(angle),
          dy = 45 * Math.sin(angle);
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [
            { x: x - dx, y: y - dy },
            { x: x + dx, y: y + dy },
          ],
        });
      }
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });
      await cdp.detach();
    } else {
      await page.mouse.move(x, y);
      await page.mouse.down({ button: 'right' });
      await page.mouse.move(x + 80, y, { steps: 8 });
      await page.mouse.up({ button: 'right' });
    }
    await expect(icon).not.toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
    await compass.click();
    await expect(icon).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
  });

  test(`fades startup credits and keeps full sources in Attributions at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/?mockGps=55.9533,-3.1883,5');
    const credits = page.locator('.maplibregl-ctrl-attrib');
    const source = credits.getByRole('link', {
      name: 'OpenFreeMap',
      exact: true,
    });
    await expect(source).toBeVisible();
    const box = (await credits.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    if (width <= 820) {
      const search = (await page.locator('.mobile-map-toolbar').boundingBox())!;
      const layers = (await page
        .getByTestId('map-layers-trigger')
        .boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(search.y + search.height - 1);
      expect(box.y + box.height).toBeLessThanOrEqual(layers.y + 1);
    }
    await expect(source).not.toBeVisible({ timeout: 10_000 });
    await expect(credits).toHaveCSS('opacity', '0');
    await expect(
      page.getByLabel('Toggle attribution', { exact: true }),
    ).not.toBeVisible();
    if (width <= 820) {
      await page
        .getByRole('button', { name: 'Bike Neuk menu', exact: true })
        .click();
    }
    await page
      .getByRole('button', { name: 'Attributions', exact: true })
      .click();
    const panel = page.getByRole('dialog', {
      name: 'Attributions',
      exact: true,
    });
    await expect(
      panel.getByRole('link', { name: 'OpenFreeMap', exact: true }),
    ).toHaveAttribute('href', 'https://openfreemap.org/');
    await expect(
      panel.getByRole('link', { name: '© OpenMapTiles', exact: true }),
    ).toBeVisible();
    await expect(
      panel.getByRole('link', { name: 'OpenStreetMap', exact: true }),
    ).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright');
  });
}
