import { expect, test } from '@playwright/test';
import { installOfflineMapFixture } from './offline-map-fixtures';

test.beforeEach(async ({ context }) => {
  await installOfflineMapFixture(context);
});

test('compares destination parking and replaces only the route finish', async ({
  page,
}) => {
  test.setTimeout(60_000);

  await page.route('https://photon.komoot.io/api/**', async (route) => {
    const query = new URL(route.request().url()).searchParams.get('q') ?? '';
    const isDestination = query.toLowerCase().includes('museum');
    const features = isDestination
      ? [
          {
            geometry: { coordinates: [-3.189, 55.947] },
            properties: {
              country: 'United Kingdom',
              name: 'National Museum',
              osm_id: 2,
              osm_type: 'N',
            },
          },
          {
            geometry: { coordinates: [-3.19, 55.9472] },
            properties: {
              country: 'United Kingdom',
              name: 'National Museum Annex',
              osm_id: 3,
              osm_type: 'N',
            },
          },
          {
            geometry: { coordinates: [-3.191, 55.9474] },
            properties: {
              country: 'United Kingdom',
              name: 'Museum Collections Centre',
              osm_id: 4,
              osm_type: 'N',
            },
          },
        ]
      : [
          {
            geometry: { coordinates: [-3.1883, 55.9533] },
            properties: {
              country: 'United Kingdom',
              name: 'Home',
              osm_id: 1,
              osm_type: 'N',
            },
          },
        ];
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        features,
      }),
    });
  });

  await page.route(
    'https://api.cyclestreets.net/v2/journey.plan**',
    async (route) => {
      const requestUrl = new URL(route.request().url());
      const callback = requestUrl.searchParams.get('callback');
      const waypointValues =
        requestUrl.searchParams.get('waypoints')?.split('|') ?? [];
      const parseWaypoint = (value: string) => {
        const [longitude, latitude] = value.split(',');
        return [Number(longitude), Number(latitude)] as [number, number];
      };
      const start = parseWaypoint(waypointValues[0] ?? '');
      const finish = parseWaypoint(waypointValues.at(-1) ?? '');
      const candidateSeconds =
        360 + Math.round(Math.abs(finish[0] + 3.189) * 10_000);

      await new Promise((resolve) => setTimeout(resolve, 300));
      await route.fulfill({
        contentType: 'application/javascript',
        body: `${callback}(${JSON.stringify({
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: {
                path: 'plan/balanced',
                plan: 'balanced',
                lengthMetres: 1_200,
                timeSeconds: candidateSeconds,
              },
              geometry: {
                type: 'LineString',
                coordinates: [start, finish],
              },
            },
          ],
        })});`,
      });
    },
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?mockGps=55.9533,-3.1883,5');
  await expect(page.getByTestId('parking-list')).toBeVisible();

  const mobileMenu = page.locator('.settings-menu--mobile');
  await mobileMenu.locator('.settings-trigger').click();
  await mobileMenu.getByTestId('plan-route').click();
  const planner = page.getByTestId('route-journey');
  const destinationSearch = page.getByRole('region', {
    name: 'Choose destination',
  });
  const destinationInput = destinationSearch.getByRole('combobox', {
    name: 'Search destination',
  });
  await destinationInput.fill('Museum');
  const destinationResults = destinationSearch.getByRole('option');
  await expect(destinationResults).toHaveCount(3);
  await destinationInput.press('ArrowDown');
  await expect(destinationResults.nth(1)).toHaveClass(/is-active/);
  await destinationInput.press('Enter');
  await expect(planner.getByTestId('journey-destination')).toContainText(
    'National Museum Annex',
  );
  await expect(planner.getByLabel('Route style')).toBeVisible();
  await planner.getByTestId('journey-start').click();
  await page
    .getByRole('combobox', { name: 'Choose a starting point' })
    .fill('Home');
  await page.getByRole('option', { name: 'Home' }).click();
  await expect(planner.getByTestId('journey-start')).toContainText('Home');
  await page.getByTestId('finish-at-bike-parking').click();
  const chooser = page.getByTestId('destination-parking-chooser');
  await expect(chooser).toBeVisible();
  await expect(chooser).toContainText('National Museum Annex');
  await expect(chooser).toContainText('straight-line to destination');
  await expect(chooser).not.toContainText('Customers');
  await expect(page.locator('[data-testid^="parking-marker-"]')).toHaveCount(3);

  await chooser.getByRole('button', { name: 'Compare all 3' }).click();
  const choices = chooser.locator('.destination-parking-list button');
  await expect(choices).toHaveCount(3);
  await expect(choices.first()).toContainText('Spaces');
  await expect(choices.first()).toContainText('Access');
  expect(
    await chooser
      .locator('.destination-parking-list')
      .evaluate((element) => getComputedStyle(element).overflowY),
  ).toBe('visible');
  await page.setViewportSize({ width: 320, height: 568 });
  const originalDestinationButton = chooser.getByRole('button', {
    name: 'Use original destination',
  });
  await originalDestinationButton.scrollIntoViewIfNeeded();
  await expect(originalDestinationButton).toBeVisible();
  await choices.nth(1).click();
  const chosenName = await choices
    .nth(1)
    .locator('.destination-parking-list-heading > strong')
    .innerText();
  await chooser.getByTestId('destination-parking-confirm').click();

  await expect(planner).toBeVisible();
  await expect(planner.getByTestId('journey-start')).toContainText('Home');
  await expect(planner.getByTestId('journey-destination')).toContainText(
    chosenName,
  );
  await expect(planner.getByTestId('journey-destination')).not.toContainText(
    'National Museum Annex',
  );
});
