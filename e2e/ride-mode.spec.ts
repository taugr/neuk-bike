import { expect, test, type Page } from '@playwright/test';
import { installOfflineMapFixture } from './offline-map-fixtures';

declare global {
  interface Window {
    __rideTest: {
      emit: (latitude: number, longitude: number) => void;
      acquired: number;
      released: number;
      cancelled: number;
      spoken: string[];
      activeSpeech: string | null;
      releaseLock: () => void;
    };
  }
}

test.beforeEach(async ({ context, page }) => {
  await installOfflineMapFixture(context);
  await context.route('https://www.google.com/maps/embed/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<p>Street View fixture</p>',
    }),
  );
  await context.grantPermissions(['geolocation']);
  await page.addInitScript(() => {
    let watch: PositionCallback | null = null;
    const position = (latitude: number, longitude: number) =>
      ({
        coords: {
          latitude,
          longitude,
          accuracy: 5,
          heading: null,
          altitude: null,
          altitudeAccuracy: null,
          speed: null,
        },
        timestamp: Date.now(),
      }) as GeolocationPosition;
    const state = (window.__rideTest = {
      emit: (latitude: number, longitude: number) =>
        watch?.(position(latitude, longitude)),
      acquired: 0,
      released: 0,
      cancelled: 0,
      spoken: [] as string[],
      activeSpeech: null as string | null,
      releaseLock: () => {},
    });
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: (success: PositionCallback) =>
          setTimeout(() => success(position(55.9533, -3.1883)), 0),
        watchPosition: (success: PositionCallback) => {
          watch = success;
          setTimeout(() => state.emit(55.9533, -3.1883), 0);
          return 42;
        },
        clearWatch: () => {
          watch = null;
        },
      },
    });
    Object.defineProperty(navigator, 'wakeLock', {
      value: {
        request: async () => {
          state.acquired++;
          const lock = new EventTarget() as EventTarget & {
            release: () => Promise<void>;
          };
          let released = false;
          lock.release = async () => {
            if (released) return;
            released = true;
            state.released++;
            lock.dispatchEvent(new Event('release'));
          };
          state.releaseLock = () => {
            void lock.release();
          };
          return lock;
        },
      },
    });
    const speech = new EventTarget() as EventTarget & {
      getVoices: () => unknown[];
      cancel: () => void;
      speak: (utterance: SpeechSynthesisUtterance) => void;
    };
    speech.getVoices = () => [
      { localService: true, lang: 'en-GB', name: 'Test local voice' },
    ];
    speech.cancel = () => {
      state.cancelled++;
      state.activeSpeech = null;
    };
    speech.speak = (utterance) => {
      state.spoken.push(utterance.text);
      state.activeSpeech = utterance.text;
    };
    Object.defineProperty(window, 'speechSynthesis', { value: speech });
    // A lightweight constructor allows deterministic voice assignment.
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      value: class {
        constructor(public text: string) {}
      },
    });
  });
  await page.route('https://photon.komoot.io/api/**', (route) =>
    route.fulfill({
      json: {
        features: [
          {
            geometry: { coordinates: [-3.1883, 55.96] },
            properties: {
              name: 'Test destination',
              country: 'United Kingdom',
              city: 'Edinburgh',
              osm_id: 2,
              osm_type: 'N',
            },
          },
        ],
      },
    }),
  );
  await page.route(
    'https://api.cyclestreets.net/v2/journey.plan*',
    async (route) => {
      const url = new URL(route.request().url());
      const endpoints = (url.searchParams.get('waypoints') ?? '')
        .split('|')
        .map((point) => point.split(',').slice(0, 2).map(Number));
      const coordinates = [
        endpoints[0],
        [-3.1883, 55.956],
        ...endpoints.slice(1),
      ];
      await route.fulfill({
        contentType: 'application/javascript',
        body: `${url.searchParams.get('callback')}(${JSON.stringify({
          type: 'FeatureCollection',
          features: ['quietest', 'balanced', 'fastest'].flatMap((plan) => [
            {
              type: 'Feature',
              properties: {
                path: `plan/${plan}`,
                plan,
                lengthMetres: 1200,
                timeSeconds: 400,
              },
              geometry: { type: 'LineString', coordinates },
            },
            {
              type: 'Feature',
              properties: {
                path: `plan/${plan}/street/0`,
                name: 'First Street',
                turnPrevText: 'start',
                lengthMetres: 300,
                timeSeconds: 100,
              },
              geometry: {
                type: 'LineString',
                coordinates: coordinates.slice(0, 2),
              },
            },
            {
              type: 'Feature',
              properties: {
                path: `plan/${plan}/street/1`,
                name: 'Next Street',
                turnPrevText: 'turn right',
                lengthMetres: 900,
                timeSeconds: 300,
              },
              geometry: {
                type: 'LineString',
                coordinates: coordinates.slice(1),
              },
            },
          ]),
        })});`,
      });
    },
  );
});

async function plan(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.location-context')).toHaveCount(0);
  await expect(page.getByTestId('parking-list')).toBeVisible();
  await page
    .getByRole('button', { name: /^(Plan a route|Resume route)$/ })
    .click();
  await page.getByRole('combobox').fill('Destination');
  await page.getByRole('option').click();
  await expect(
    page.getByRole('button', { name: 'Start route', exact: true }),
  ).toBeVisible();
}

test('guidance, audio and wake lock survive starting, recover on foreground, and release on arrival/stop', async ({
  page,
}) => {
  await plan(page);
  await expect(page.getByTestId('ride-guidance')).toHaveCount(0);
  expect(await page.evaluate(() => window.__rideTest.acquired)).toBe(0);
  expect(await page.evaluate(() => window.__rideTest.spoken)).toEqual([]);
  await page.getByRole('button', { name: 'Start route', exact: true }).click();
  await expect(page.getByTestId('ride-next-turn')).toContainText(
    'Turn right onto Next Street',
  );
  await expect
    .poll(() => page.evaluate(() => window.__rideTest.acquired))
    .toBe(1);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__rideTest.spoken.filter((text) =>
            text.includes('Next Street'),
          ).length,
      ),
    )
    .toBe(1);
  await page.evaluate(() => window.__rideTest.emit(55.954, -3.1883));
  await expect(page.getByTestId('ride-next-turn')).toContainText('223 m');
  expect(
    await page.evaluate(
      () =>
        window.__rideTest.spoken.filter((text) => text.includes('Next Street'))
          .length,
    ),
  ).toBe(1);
  // GPS jitter near the advance-cue threshold must not repeat spoken turns.
  await page.evaluate(() => window.__rideTest.emit(55.9556, -3.1883));
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__rideTest.spoken.filter((text) =>
            text.includes('Next Street'),
          ).length,
      ),
    )
    .toBe(2);
  await page.evaluate(() => window.__rideTest.emit(55.9555, -3.1883));
  await expect(page.getByTestId('ride-next-turn')).toContainText('56 m');
  await page.evaluate(() => window.__rideTest.emit(55.9556, -3.1883));
  await expect(page.getByTestId('ride-next-turn')).toContainText('45 m');
  expect(
    await page.evaluate(
      () =>
        window.__rideTest.spoken.filter((text) => text.includes('Next Street'))
          .length,
    ),
  ).toBe(2);
  await page.evaluate(() => {
    window.__rideTest.releaseLock();
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect
    .poll(() => page.evaluate(() => window.__rideTest.acquired))
    .toBe(2);
  await page.evaluate(() => window.__rideTest.emit(55.96, -3.1883));
  await expect(
    page.getByRole('button', { name: 'Done', exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.__rideTest.released))
    .toBe(2);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByTestId('live-route-marker')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Start route', exact: true }),
  ).toBeVisible();
});

test('recalculates from current GPS, retains destination/style, and keeps tracking', async ({
  page,
}) => {
  await plan(page);
  await page.getByTestId('route-plan-quietest').click();
  await page.getByRole('button', { name: 'Start route', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Stop', exact: true }),
  ).toBeVisible();
  await page.evaluate(() => window.__rideTest.emit(55.954, -3.18));
  const reroute = page.getByRole('button', {
    name: 'Recalculate route',
    exact: true,
  });
  await expect(reroute).toBeVisible();
  const request = page.waitForRequest((r) => r.url().includes('journey.plan'));
  await reroute.click();
  const url = new URL((await request).url());
  const coordinates = url.searchParams.get('waypoints')!.split('|');
  expect(coordinates[0]!.split(',').slice(0, 2).map(Number)).toEqual([
    -3.18, 55.954,
  ]);
  expect(coordinates.at(-1)!.split(',').slice(0, 2).map(Number)).toEqual([
    -3.1883, 55.96,
  ]);
  await expect(reroute).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Stop', exact: true }),
  ).toBeVisible();
  await page.evaluate(() => window.__rideTest.emit(55.955, -3.18415));
  await expect(page.locator('.live-route-marker-off-route')).toHaveCount(0);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.getByTestId('journey-destination')).toContainText(
    'Test destination',
  );
  await expect(page.getByTestId('route-plan-quietest')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('failed and offline recalculation preserve the route; a stopped ride ignores a late response', async ({
  page,
  context,
}) => {
  await plan(page);
  await page.getByRole('button', { name: 'Start route', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Stop', exact: true }),
  ).toBeVisible();
  await page.evaluate(() => window.__rideTest.emit(55.954, -3.18));
  await context.setOffline(true);
  await page
    .getByRole('button', { name: 'Recalculate route', exact: true })
    .click({ noWaitAfter: true });
  await expect(
    page.getByText(
      'Connect to the internet to recalculate. Your original route is still here.',
    ),
  ).toBeVisible();
  await context.setOffline(false);
  await page.route(
    'https://api.cyclestreets.net/v2/journey.plan*',
    async (route) => {
      const callback = new URL(route.request().url()).searchParams.get(
        'callback',
      );
      await route.fulfill({
        contentType: 'application/javascript',
        body: `${callback}({error:'No route'});`,
      });
    },
  );
  await page
    .getByRole('button', { name: 'Recalculate route', exact: true })
    .click();
  await expect(
    page.getByText(
      'Couldn’t recalculate. Your original route is still here. Try again.',
    ),
  ).toBeVisible();
  await page.unroute('https://api.cyclestreets.net/v2/journey.plan*');
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    'https://api.cyclestreets.net/v2/journey.plan*',
    async (route) => {
      await gate;
      const callback = new URL(route.request().url()).searchParams.get(
        'callback',
      );
      await route.fulfill({
        contentType: 'application/javascript',
        body: `${callback}({type:'FeatureCollection',features:[{type:'Feature',properties:{path:'plan/balanced',lengthMetres:100,timeSeconds:10},geometry:{type:'LineString',coordinates:[[-3.18,55.954],[-3.1883,55.96]]}}]});`,
      });
    },
  );
  await page
    .getByRole('button', { name: 'Recalculate route', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Recalculating…', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  release!();
  await expect(page.getByTestId('route-plan-balanced')).toContainText('7 min');
  await expect(page.getByTestId('live-route-marker')).toHaveCount(0);
});

for (const width of [320, 390, 581, 1440]) {
  test(`mute control fits the turn panel and cancels/resumes speech at ${width}px`, async ({
    page,
  }, testInfo) => {
    await plan(page);
    await page.setViewportSize({ width, height: 844 });
    await page
      .getByRole('button', { name: 'Start route', exact: true })
      .click();
    const mute = page.getByRole('button', {
      name: 'Mute spoken directions',
      exact: true,
    });
    await expect(mute).toBeVisible();
    const buttonBox = await mute.boundingBox();
    expect(buttonBox!.width).toBeGreaterThanOrEqual(44);
    expect(buttonBox!.height).toBeGreaterThanOrEqual(44);
    await expect
      .poll(() => page.evaluate(() => window.__rideTest.activeSpeech))
      .toContain('Next Street');
    await mute.click();
    await expect(
      page.getByRole('button', {
        name: 'Unmute spoken directions',
        exact: true,
      }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => window.__rideTest.activeSpeech),
    ).toBeNull();
    const spoken = await page.evaluate(() => window.__rideTest.spoken.length);
    await page.evaluate(() => window.__rideTest.emit(55.9556, -3.1883));
    await expect(page.getByTestId('ride-next-turn')).toContainText('45 m');
    expect(await page.evaluate(() => window.__rideTest.spoken.length)).toBe(
      spoken,
    );
    await page
      .getByRole('button', { name: 'Unmute spoken directions', exact: true })
      .click();
    await expect(mute).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.__rideTest.activeSpeech))
      .toContain('Next Street');
    expect(await page.evaluate(() => window.__rideTest.spoken.length)).toBe(
      spoken + 1,
    );
    const panel = await page.getByTestId('ride-next-turn').boundingBox();
    expect(buttonBox!.x + buttonBox!.width).toBeLessThanOrEqual(
      panel!.x + panel!.width,
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
    await page.screenshot({ path: testInfo.outputPath(`riding-${width}.png`) });
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(page.getByTestId('ride-guidance')).toHaveCount(0);
    expect(
      await page.evaluate(() => window.__rideTest.activeSpeech),
    ).toBeNull();
    await expect
      .poll(() => page.evaluate(() => window.__rideTest.released))
      .toBe(1);
  });
}

test('remembers mute across reload and does not speak before loading the preference', async ({
  page,
}) => {
  await plan(page);
  await page.getByRole('button', { name: 'Start route', exact: true }).click();
  await page
    .getByRole('button', { name: 'Mute spoken directions', exact: true })
    .click();
  await plan(page);
  await page.getByRole('button', { name: 'Start route', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Unmute spoken directions', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.__rideTest.spoken)).toEqual([]);
  await expect
    .poll(() => page.evaluate(() => window.__rideTest.acquired))
    .toBe(1);
});

test('blocked storage keeps mute usable for this ride', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new Error('blocked');
    };
  });
  await plan(page);
  await page.getByRole('button', { name: 'Start route', exact: true }).click();
  await page
    .getByRole('button', { name: 'Mute spoken directions', exact: true })
    .click();
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await page.getByRole('button', { name: 'Start route', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Unmute spoken directions', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.__rideTest.activeSpeech)).toBeNull();
});

test('unavailable wake lock and local voice are explained only while riding', async ({
  page,
}) => {
  await page.addInitScript(() => {
    speechSynthesis.getVoices = () => [];
    navigator.wakeLock.request = async () => {
      throw new Error('Denied');
    };
  });
  await plan(page);
  await expect(page.getByTestId('ride-guidance')).toHaveCount(0);
  await page.getByRole('button', { name: 'Start route', exact: true }).click();
  await expect(page.getByTestId('ride-audio-toggle')).toBeDisabled();
  await expect(page.getByTestId('ride-guidance')).toContainText(
    'Your device may let the screen turn off.',
  );
  await expect(page.getByTestId('ride-guidance')).toContainText(
    'No on-device voice is available',
  );
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.getByTestId('ride-guidance')).toHaveCount(0);
});

test('blocked automatic speech can retry directly from the speaker tap', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const speak = speechSynthesis.speak;
    let first = true;
    speechSynthesis.speak = (utterance) => {
      if (first) {
        first = false;
        utterance.onerror?.({
          error: 'not-allowed',
        } as SpeechSynthesisErrorEvent);
      } else speak(utterance);
    };
  });
  await plan(page);
  await page.getByRole('button', { name: 'Start route', exact: true }).click();
  await expect(page.getByTestId('ride-guidance')).toContainText(
    'Tap the speaker to enable spoken directions.',
  );
  await page
    .getByRole('button', { name: 'Unmute spoken directions', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Mute spoken directions', exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.__rideTest.activeSpeech))
    .toContain('Next Street');
  await expect(page.getByTestId('ride-guidance')).not.toContainText(
    'Tap the speaker',
  );
});
