import type { BrowserContext, Page } from '@playwright/test';
import { expect } from '@playwright/test';

const providerOrigin = 'https://tiles.openfreemap.org';
const tileReleasePath = '/planet/20260816_080001_pt';

export type OfflineMapFixtureState = {
  delayTiles?: boolean;
  failMatching?: RegExp;
  failNextMatching?: RegExp;
  failedRequests: string[];
  requests: string[];
};

function style(theme: 'dark' | 'light') {
  const dark = theme === 'dark';
  return {
    version: 8,
    name: `Deterministic offline ${theme}`,
    sources: {
      openmaptiles: {
        type: 'vector',
        url: `${providerOrigin}/planet`,
      },
      'offline-test-rendered': {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: { name: 'Offline fixture' },
              geometry: {
                type: 'Polygon',
                coordinates: [
                  [
                    [-4.2, 55.4],
                    [-2.2, 55.4],
                    [-2.2, 56.5],
                    [-4.2, 56.5],
                    [-4.2, 55.4],
                  ],
                ],
              },
            },
          ],
        },
      },
    },
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: { 'background-color': dark ? '#101817' : '#edf2ef' },
      },
      {
        id: 'offline-fixture-fill',
        type: 'fill',
        source: 'offline-test-rendered',
        paint: {
          'fill-color': dark ? '#315f52' : '#9bc9b8',
          'fill-opacity': 0.82,
        },
      },
      {
        id: 'offline-fixture-line',
        type: 'line',
        source: 'offline-test-rendered',
        paint: {
          'line-color': dark ? '#9ed8c7' : '#245f50',
          'line-width': 3,
        },
      },
      {
        id: 'offline-vector-coverage',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'fixture',
        paint: { 'fill-opacity': 0 },
      },
    ],
  };
}

export async function installOfflineMapFixture(
  context: BrowserContext,
  initial: Partial<OfflineMapFixtureState> = {},
) {
  const state: OfflineMapFixtureState = {
    failedRequests: [],
    requests: [],
    ...initial,
  };

  await context.route(`${providerOrigin}/**`, async (route) => {
    const url = new URL(route.request().url());
    state.requests.push(url.href);

    if (
      state.failMatching?.test(url.href) ||
      state.failNextMatching?.test(url.href)
    ) {
      state.failNextMatching = undefined;
      state.failedRequests.push(url.href);
      await route.fulfill({ body: 'fixture failure', status: 503 });
      return;
    }

    if (url.pathname === '/styles/liberty') {
      await route.fulfill({
        body: JSON.stringify(style('light')),
        contentType: 'application/json',
      });
      return;
    }
    if (url.pathname === '/styles/dark') {
      await route.fulfill({
        body: JSON.stringify(style('dark')),
        contentType: 'application/json',
      });
      return;
    }
    if (url.pathname === '/planet') {
      await route.fulfill({
        body: JSON.stringify({
          // Match OpenFreeMap: higher map zooms reuse level-14 vector tiles.
          minzoom: 0,
          maxzoom: 14,
          attribution:
            '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> <a href="https://www.openmaptiles.org/" target="_blank">&copy; OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
          tiles: [`${providerOrigin}${tileReleasePath}/{z}/{x}/{y}.pbf`],
        }),
        contentType: 'application/json',
      });
      return;
    }
    if (url.pathname.startsWith(`${tileReleasePath}/`)) {
      if (state.delayTiles) {
        await new Promise((resolve) => setTimeout(resolve, 3_000));
      }
      await route.fulfill({
        body: '',
        contentType: 'application/vnd.mapbox-vector-tile',
      });
      return;
    }

    await route.fulfill({ body: 'Unexpected fixture URL', status: 404 });
  });

  return state;
}

export async function waitForServiceWorker(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
}

export async function expectRenderedBasemap(page: Page) {
  await expect
    .poll(async () => {
      const value = await page
        .getByTestId('parking-map')
        .getAttribute('data-rendered-basemap-features');
      return Number(value ?? 0);
    })
    .toBeGreaterThan(0);
}

export async function openOfflineAreas(page: Page, mobile = false) {
  const settings = page.locator(
    mobile ? '.settings-menu--mobile' : '.settings-menu--desktop',
  );
  await settings.locator('.settings-trigger').click();
  await settings.getByTestId('open-offline-areas').click();
  const library = page.getByRole('dialog', { name: 'Offline areas' });
  await expect(library).toBeVisible();
  return library;
}

export async function startOfflineAreaDownload(
  page: Page,
  name: string,
  mobile = false,
) {
  const library = await openOfflineAreas(page, mobile);
  await library.getByRole('button', { name: 'Download this area' }).click();
  const selection = page.getByRole('region', { name: 'Download this area' });
  await expect(selection).toBeVisible();
  await selection.getByLabel('Area name').fill(name);
  await expect(selection.getByText(/^About /)).toBeVisible();
  await selection.getByRole('button', { name: 'Download area' }).click();
  return selection;
}
