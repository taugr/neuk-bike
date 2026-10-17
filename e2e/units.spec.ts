import { expect as baseExpect, test, type Page } from '@playwright/test';
// Startup camera focus plus intentional forecast debounce may exceed five seconds.
const expect = baseExpect.configure({ timeout: 10000 });
import { readFileSync } from 'node:fs';
import { installOfflineMapFixture } from './offline-map-fixtures';
import {
  enableWindMap,
  installWindJourneyFixture,
  openWindJourney,
} from './wind-fixtures';
const raw = JSON.parse(
  readFileSync(
    new URL(
      '../src/lib/fixtures/ukv-edinburgh-2026-10-15.json',
      import.meta.url,
    ),
    'utf8',
  ),
).grid.slice(0, 20);
async function settings(page: Page) {
  await page
    .getByRole('button', { name: /^(Bike Neuk menu|Theme settings)$/ })
    .click();
  await expect(
    page.getByRole('combobox', { name: 'Units', exact: true }),
  ).toBeVisible();
}
test.beforeEach(async ({ page, context }) => {
  await installOfflineMapFixture(context);
  await page.clock.setFixedTime(new Date('2026-10-15T20:20:00Z'));
  await page.route('https://api.open-meteo.com/v1/forecast*', (r) =>
    r.fulfill({ json: raw }),
  );
});
for (const width of [320, 390, 1440])
  test(`units update grid wind, parking and persist at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.getByTestId('map-layers-trigger').click();
    await page.getByTestId('wind-layer-toggle').check();
    await expect(page.locator('.wind-map-arrow').first()).toBeVisible();
    await page.getByTestId('map-layers-trigger').click();
    await expect(page.locator('.wind-map-speed').first()).toContainText('km/h');
    const original = await page
      .locator('.wind-map-arrow')
      .evaluateAll((ns) => ns.map((n) => ({ ...(n as HTMLElement).dataset })));
    await settings(page);
    await expect(
      page.getByRole('combobox', { name: 'Units', exact: true }),
    ).toHaveValue('metric');
    await page
      .getByRole('combobox', { name: 'Units', exact: true })
      .selectOption('imperial');
    await expect(page.locator('.wind-map-speed').first()).toContainText('mph');
    await expect(page.getByTestId('wind-overlay')).toHaveAttribute(
      'aria-label',
      /miles per hour/,
    );
    expect(
      await page
        .locator('.wind-map-arrow')
        .evaluateAll((ns) =>
          ns.map((n) => ({ ...(n as HTMLElement).dataset })),
        ),
    ).toEqual(original);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('parking-list')).toContainText('ft away');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
    await page.reload();
    await settings(page);
    await expect(
      page.getByRole('combobox', { name: 'Units', exact: true }),
    ).toHaveValue('imperial');
    await page
      .getByRole('combobox', { name: 'Units', exact: true })
      .selectOption('metric');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('parking-list')).toContainText('m away');
  });
for (const width of [390, 1440])
  test(`units convert climbing and preserve route choice at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await settings(page);
    await page
      .getByRole('combobox', { name: 'Units', exact: true })
      .selectOption('imperial');
    await installWindJourneyFixture(page);
    await openWindJourney(page);
    await expect(page.getByTestId('route-plan-balanced')).toContainText(
      '0.6 mi',
    );
    await enableWindMap(page);
    await expect(page.getByTestId('route-ascent-balanced')).toHaveText('79 ft');
    await expect(page.getByTestId('route-ascent-balanced')).toHaveAttribute(
      'aria-label',
      'Climbing: 79 ft',
    );
    await expect(page.getByTestId('route-plan-balanced')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('.wind-map-speed').first()).toHaveText('9.8 mph');
    await expect(page.getByTestId('wind-overlay')).toHaveAttribute(
      'aria-label',
      /9.8 mph/,
    );
  });
test('invalid saved units fall back to metric and blocked storage keeps the choice for this visit', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem('cycle-parking-units', 'bogus'),
  );
  await page.goto('/');
  await settings(page);
  await expect(
    page.getByRole('combobox', { name: 'Units', exact: true }),
  ).toHaveValue('metric');
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new Error('blocked');
    };
  });
  await page
    .getByRole('combobox', { name: 'Units', exact: true })
    .selectOption('imperial');
  await expect(
    page.getByRole('combobox', { name: 'Units', exact: true }),
  ).toHaveValue('imperial');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('parking-list')).toContainText('ft away');
});
