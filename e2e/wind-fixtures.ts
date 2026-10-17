import { expect as baseExpect, type Page } from '@playwright/test';
import { installOfflineMapFixture } from './offline-map-fixtures';
import { createWindTestRoutes } from '../test/fixtures/wind-routes';

const expect = baseExpect.configure({ timeout: 10000 });

// All synthetic weather and route geometry stays in the test runner. The app
// follows its normal search, provider-routing and forecast-loading paths.
export async function installWindJourneyFixture(page: Page) {
  await installOfflineMapFixture(page.context());
  const { routes } = createWindTestRoutes();
  const destination = routes.balanced!.points.at(-1)!;
  await page.route('https://api.open-meteo.com/v1/forecast*', async (route) => {
    const hour = await page.evaluate(
      () => new Date().toISOString().slice(0, 13) + ':00',
    );
    return route.fulfill({
      json: {
        latitude: 55.959354,
        longitude: -3.1747131,
        utc_offset_seconds: 0,
        hourly_units: { wind_speed_10m: 'm/s', wind_direction_10m: '°' },
        hourly: {
          time: [hour],
          wind_speed_10m: [4.4],
          wind_direction_10m: [194],
        },
      },
    });
  });
  await page.route('https://photon.komoot.io/api/**', (route) =>
    route.fulfill({
      json: {
        features: [
          {
            geometry: { coordinates: [destination[1], destination[0]] },
            properties: {
              name: 'Wind test destination',
              city: 'Edinburgh',
              country: 'United Kingdom',
              osm_id: 123,
              osm_type: 'N',
            },
          },
        ],
      },
    }),
  );
  await page.route('https://api.cyclestreets.net/v2/journey.plan*', (route) => {
    const url = new URL(route.request().url());
    return route.fulfill({
      contentType: 'application/javascript',
      body: `${url.searchParams.get('callback')}(${JSON.stringify({
        type: 'FeatureCollection',
        features: Object.values(routes).flatMap((candidate) => [
          {
            type: 'Feature',
            properties: {
              path: `plan/${candidate.plan}`,
              plan: candidate.plan,
              lengthMetres: candidate.distanceMeters,
              timeSeconds: candidate.durationSeconds,
            },
            geometry: {
              type: 'LineString',
              coordinates: candidate.points.map(([lat, lng]) => [lng, lat]),
            },
          },
          {
            type: 'Feature',
            properties: {
              path: `plan/${candidate.plan}/street/1`,
              lengthMetres: candidate.distanceMeters,
              elevationsMetres: [
                10,
                10 +
                  { quietest: 18, balanced: 24, fastest: 42 }[candidate.plan],
              ],
            },
            geometry: {
              type: 'LineString',
              coordinates: candidate.points.map(([lat, lng]) => [lng, lat]),
            },
          },
        ]),
      })});`,
    });
  });
}

export async function openWindJourney(page: Page) {
  await page.goto('/?mockGps=55.9533,-3.1883,5');
  await expect(page.getByTestId('parking-list')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Current location', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: /^(Plan a route|Resume route)$/ })
    .click();
  await page
    .getByRole('combobox', { name: 'Search destination' })
    .fill('Wind test');
  await page.getByRole('option').click();
  await expect(page.getByTestId('route-plan-balanced')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(
    page.getByRole('switch', { name: 'Prefer less headwind' }),
  ).toHaveCount(0);
}
export async function enableWindMap(page: Page) {
  await page.getByTestId('map-layers-trigger').click();
  await page.getByTestId('wind-layer-toggle').check();
  await page.getByTestId('map-layers-trigger').click();
}
