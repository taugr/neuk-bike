import { expect, test } from '@playwright/test';
import {
  enableWindMap,
  installWindJourneyFixture,
  openWindJourney as journey,
} from './wind-fixtures';
test.beforeEach(async ({ page }) => {
  await installWindJourneyFixture(page);
});
test('private HTTP preview works without crypto.randomUUID and weather is only requested on demand', async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window.crypto, 'randomUUID', { value: undefined }),
  );
  let requests = 0;
  page.on('request', (r) => {
    if (r.url().startsWith('https://api.open-meteo.com')) requests++;
  });
  await journey(page);
  expect(requests).toBe(0);
  await enableWindMap(page);
  await expect(page.locator('.wind-map-arrow').first()).toBeVisible();
  expect(requests).toBeGreaterThan(0);
  await expect(page.getByTestId('route-plan-balanced')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
for (const width of [320, 390, 581, 1440]) {
  test(`climbing cards, manual wind map and riding at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 931 });
    await journey(page);
    for (const [plan, value] of [
      ['quietest', '18 m'],
      ['balanced', '24 m'],
      ['fastest', '42 m'],
    ]) {
      await expect(page.getByTestId(`route-ascent-${plan}`)).toHaveText(value);
    }
    const endpoints = await page.locator('.journey-endpoints').boundingBox();
    expect(endpoints!.height).toBeLessThan(65);
    await expect(page.getByTestId('wind-overlay')).toHaveCount(0);
    await enableWindMap(page);
    await expect(page.locator('.wind-map-arrow').first()).toBeVisible();
    await expect(page.getByTestId('route-plan-balanced')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByTestId('route-plan-fastest').click();
    await page.screenshot({
      path: testInfo.outputPath(`climbing-${width}.png`),
    });
    await page.getByRole('button', { name: 'Back to nearby neuks' }).click();
    await page
      .getByRole('button', { name: 'Resume route', exact: true })
      .click();
    await expect(page.getByTestId('route-plan-fastest')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByTestId('wind-overlay')).toBeVisible();
    await page
      .getByRole('button', { name: 'Start route', exact: true })
      .click();
    await expect(page.getByTestId('live-route-marker')).toBeVisible();
    await expect(page.getByTestId('map-layers-trigger')).toHaveCount(0);
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(page.getByTestId('map-layers-trigger')).toBeVisible();
    await expect(page.getByTestId('journey-wind')).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
  });
}
test('missing weather leaves route choice and layer control usable', async ({
  page,
}) => {
  await page.route('https://api.open-meteo.com/v1/forecast*', (r) =>
    r.fulfill({ status: 404, body: 'Missing' }),
  );
  await journey(page);
  await page.getByTestId('map-layers-trigger').click();
  await page.getByTestId('wind-layer-toggle').check();
  await expect(page.getByTestId('map-layers-popover')).toContainText(
    'Forecast unavailable',
  );
  await expect(page.getByTestId('wind-overlay')).toHaveCount(0);
  await expect(page.getByTestId('route-plan-balanced')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
test('arrows follow map rotation and keep their mobile-readable size through zoom', async ({
  page,
}) => {
  await journey(page);
  await page.getByTestId('map-layers-trigger').click();
  await page.getByTestId('wind-layer-toggle').check();
  await page.getByTestId('map-layers-trigger').click();
  const arrow = page.locator('.wind-map-arrow').first();
  await expect(arrow).toBeVisible();
  const before = Number(await arrow.getAttribute('data-bearing'));
  // Keyboard rotation also keeps the wind direction aligned with the map.
  await page.locator('.maplibregl-canvas').focus();
  await page.keyboard.press('Shift+ArrowRight');
  await expect
    .poll(async () => Number(await arrow.getAttribute('data-bearing')))
    .toBeCloseTo((before - 15 + 360) % 360, 0);
  await page.keyboard.press('Shift+ArrowLeft');
  await expect
    .poll(async () => Number(await arrow.getAttribute('data-bearing')))
    .toBeCloseTo(before, 0);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(arrow).toHaveCSS('width', '28px');
});

test('old debug URLs cannot create synthetic routes or expose diagnostic controls', async ({
  page,
}) => {
  await page.goto('/?windDemo=1&windStations=1');
  await expect(page.getByTestId('parking-list')).toBeVisible();
  await expect(page.getByTestId('route-journey')).toHaveCount(0);
  await page.getByTestId('map-layers-trigger').click();
  await expect(
    page.getByRole('link', { name: 'Try the demo route' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('switch', { name: 'Station snapshot experiment' }),
  ).toHaveCount(0);
  await expect(page.getByTestId('forecast-cells')).toHaveCount(0);
});
