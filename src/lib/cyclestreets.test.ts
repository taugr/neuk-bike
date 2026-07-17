import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildShortCycleRoute,
  buildCycleStreetsDirectionsRequest,
  CycleStreetsRouteError,
  describeCycleRouteInstruction,
  fetchCycleStreetsDirections,
  formatCycleRouteDuration,
  parseCycleStreetsRoute,
} from '@/lib/cyclestreets';
import type { ParkingPoint } from '@/lib/types';

type JsonpCallback = (response: unknown) => void;
type JsonpScript = {
  async: boolean;
  onerror: (() => void) | null;
  remove: () => void;
  src: string;
};

const destination: ParkingPoint = {
  id: 'parking-1',
  name: 'Cycle parking 1',
  latitude: 55.944,
  longitude: -3.205,
  properties: {},
  sourceId: 'test',
};

const cycleStreetsFixture = {
  type: 'FeatureCollection',
  properties: {
    start: 'Princes Street',
    finish: 'Service road',
  },
  features: [
    {
      type: 'Feature',
      properties: {
        path: 'waypoint/1',
        number: 1,
        markerTag: 'start',
        name: 'Princes Street',
      },
      geometry: {
        type: 'Point',
        coordinates: [-3.18852, 55.9534],
      },
    },
    {
      type: 'Feature',
      properties: {
        path: 'plan/balanced',
        plan: 'balanced',
        lengthMetres: 1966,
        timeSeconds: 811,
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          [-3.18852, 55.9534],
          [-3.18854, 55.95338],
          [-3.205, 55.94401],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        path: 'plan/balanced/street/1',
        number: 1,
        name: 'Princes Street',
        lengthMetres: 39,
        timeSeconds: 24,
        travelMode: 'cycling',
        turnPrevText: 'start',
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          [-3.18852, 55.9534],
          [-3.18908, 55.9533],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        path: 'plan/balanced/street/2',
        number: 2,
        name: 'North Bridge, A7',
        lengthMetres: 362,
        timeSeconds: 221,
        travelMode: 'cycling',
        turnPrevText: 'turn left',
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          [-3.18908, 55.9533],
          [-3.18841, 55.95195],
        ],
      },
    },
  ],
};

function waitForJsonpRetry() {
  return Promise.resolve().then(() => Promise.resolve());
}

function getJsonpCallbackName(script: JsonpScript) {
  const callbackName = new URL(script.src).searchParams.get('callback');

  if (!callbackName) {
    throw new Error('Expected JSONP callback parameter.');
  }

  return callbackName;
}

function installJsonpDom() {
  const scripts: JsonpScript[] = [];
  const fakeWindow = {
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    setTimeout: globalThis.setTimeout.bind(globalThis),
  } as unknown as Window & Record<string, unknown>;
  const fakeDocument = {
    createElement: vi.fn((tagName: string) => {
      if (tagName !== 'script') {
        throw new Error(`Unexpected element: ${tagName}`);
      }

      const script: JsonpScript = {
        async: false,
        onerror: null,
        remove: () => {
          const index = scripts.indexOf(script);

          if (index >= 0) {
            scripts.splice(index, 1);
          }
        },
        src: '',
      };

      return script as HTMLScriptElement;
    }),
    head: {
      append: vi.fn((script: JsonpScript) => {
        scripts.push(script);
      }),
    },
  } as unknown as Document;

  vi.stubGlobal('window', fakeWindow);
  vi.stubGlobal('document', fakeDocument);

  return { fakeWindow, scripts };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('CycleStreets utilities', () => {
  it('builds browser-compatible v2 journey requests', () => {
    const request = buildCycleStreetsDirectionsRequest({
      apiKey: 'public-test-key',
      origin: { latitude: 55.9533, longitude: -3.1883 },
      destination,
    });

    const url = new URL(request.url);

    expect(`${url.origin}${url.pathname}`).toBe(
      'https://api.cyclestreets.net/v2/journey.plan',
    );
    expect(url.searchParams.get('key')).toBe('public-test-key');
    expect(url.searchParams.get('plans')).toBe('balanced');
    expect(url.searchParams.get('speedKmph')).toBe('16');
    expect(url.searchParams.get('waypoints')).toBe(
      '-3.18830,55.95330,Start|-3.20500,55.94400,Cycle parking 1',
    );
    expect(request.headers).toEqual({
      Accept: 'application/json',
    });
  });

  it('retries browser JSONP directions once after a script error', async () => {
    const { fakeWindow, scripts } = installJsonpDom();
    const request = buildCycleStreetsDirectionsRequest({
      apiKey: 'public-test-key',
      origin: { latitude: 55.9533, longitude: -3.1883 },
      destination,
    });
    const response = fetchCycleStreetsDirections(request);

    expect(scripts).toHaveLength(1);
    const firstCallbackName = getJsonpCallbackName(scripts[0]!);

    scripts[0]!.onerror?.();
    await waitForJsonpRetry();

    expect(scripts).toHaveLength(1);
    expect(fakeWindow[firstCallbackName]).toBeUndefined();

    const secondCallbackName = getJsonpCallbackName(scripts[0]!);
    (fakeWindow[secondCallbackName] as JsonpCallback | undefined)?.(
      cycleStreetsFixture,
    );

    await expect(response).resolves.toBe(cycleStreetsFixture);
    expect(scripts).toHaveLength(0);
    expect(fakeWindow[secondCallbackName]).toBeUndefined();
  });

  it('retries browser JSONP directions once after a timeout', async () => {
    vi.useFakeTimers();
    const { fakeWindow, scripts } = installJsonpDom();
    const request = buildCycleStreetsDirectionsRequest({
      apiKey: 'public-test-key',
      origin: { latitude: 55.9533, longitude: -3.1883 },
      destination,
    });
    const response = fetchCycleStreetsDirections(request);

    expect(scripts).toHaveLength(1);
    const firstCallbackName = getJsonpCallbackName(scripts[0]!);

    vi.advanceTimersByTime(15_000);
    await waitForJsonpRetry();

    expect(scripts).toHaveLength(1);
    expect(fakeWindow[firstCallbackName]).toBeUndefined();

    const secondCallbackName = getJsonpCallbackName(scripts[0]!);
    (fakeWindow[secondCallbackName] as JsonpCallback | undefined)?.(
      cycleStreetsFixture,
    );

    await expect(response).resolves.toBe(cycleStreetsFixture);
    expect(scripts).toHaveLength(0);
  });

  it('rejects browser JSONP directions after both attempts fail', async () => {
    const { scripts } = installJsonpDom();
    const request = buildCycleStreetsDirectionsRequest({
      apiKey: 'public-test-key',
      origin: { latitude: 55.9533, longitude: -3.1883 },
      destination,
    });
    const response = fetchCycleStreetsDirections(request);

    expect(scripts).toHaveLength(1);
    scripts[0]!.onerror?.();
    await waitForJsonpRetry();

    expect(scripts).toHaveLength(1);
    scripts[0]!.onerror?.();

    await expect(response).rejects.toBeInstanceOf(CycleStreetsRouteError);
    expect(scripts).toHaveLength(0);
  });

  it('parses v2 GeoJSON routes into Leaflet latitude and longitude order', () => {
    const route = parseCycleStreetsRoute(cycleStreetsFixture, destination);

    expect(route.distanceMeters).toBe(1966);
    expect(route.durationSeconds).toBe(811);
    expect(route.points).toEqual([
      [55.9534, -3.18852],
      [55.95338, -3.18854],
      [55.94401, -3.205],
    ]);
    expect(route.source).toBe('cyclestreets');
  });

  it('parses and describes route instructions', () => {
    const route = parseCycleStreetsRoute(cycleStreetsFixture, destination);

    expect(route.instructions).toEqual([
      {
        id: 'plan/balanced/street/1',
        anchor: [55.9534, -3.18852],
        streetName: 'Princes Street',
        turn: 'start',
        distanceMeters: 39,
        durationSeconds: 24,
        travelMode: 'cycling',
      },
      {
        id: 'plan/balanced/street/2',
        anchor: [55.9533, -3.18908],
        streetName: 'North Bridge, A7',
        turn: 'turn left',
        distanceMeters: 362,
        durationSeconds: 221,
        travelMode: 'cycling',
      },
      {
        id: 'arrival-parking-1',
        anchor: [55.944, -3.205],
        streetName: 'Cycle parking 1',
        turn: 'arrive',
        distanceMeters: 0,
        durationSeconds: 0,
        travelMode: 'cycling',
      },
    ]);
    expect(describeCycleRouteInstruction(route.instructions[0]!)).toBe(
      'Start on Princes Street',
    );
    expect(describeCycleRouteInstruction(route.instructions[1]!)).toBe(
      'Turn left onto North Bridge, A7',
    );
    expect(describeCycleRouteInstruction(route.instructions[2]!)).toBe(
      'Arrive at Cycle parking 1',
    );
  });

  it('formats route duration in minutes', () => {
    expect(formatCycleRouteDuration(811)).toBe('14 min');
    expect(formatCycleRouteDuration(15)).toBe('1 min');
  });

  it('localizes route instructions while preserving road names', () => {
    const instruction = {
      id: 'left',
      anchor: [40.4168, -3.7038] as [number, number],
      streetName: 'Calle de Alcalá',
      turn: 'turn left',
      distanceMeters: 120,
      durationSeconds: 30,
      travelMode: 'cycling',
    };

    expect(describeCycleRouteInstruction(instruction, 'es')).toBe(
      'Gira a la izquierda por Calle de Alcalá',
    );
    expect(describeCycleRouteInstruction(instruction, 'gd')).toBe(
      'Tionndaidh gu clì gu Calle de Alcalá',
    );
    expect(formatCycleRouteDuration(811, 'gd')).toBe('14 mion');
  });

  it('builds local short routes for nearby parking', () => {
    const route = buildShortCycleRoute(
      { latitude: 55.9533, longitude: -3.1883 },
      {
        id: 'near',
        name: 'Nearby parking',
        latitude: 55.95332,
        longitude: -3.18833,
        properties: {},
        sourceId: 'test',
      },
    );

    expect(route.source).toBe('local');
    expect(route.routeUrl).toBeUndefined();
    expect(route.distanceMeters).toBeGreaterThan(2);
    expect(route.distanceMeters).toBeLessThan(4);
    expect(route.durationSeconds).toBeGreaterThanOrEqual(1);
    expect(route.points).toEqual([
      [55.9533, -3.1883],
      [55.95332, -3.18833],
    ]);
    expect(route.instructions).toHaveLength(2);
    expect(route.instructions[0]).toMatchObject({
      id: 'short-route-near',
      anchor: [55.9533, -3.1883],
      streetName: '',
      turn: 'straight',
      travelMode: 'walking',
    });
    expect(route.instructions[1]).toMatchObject({
      id: 'arrival-near',
      anchor: [55.95332, -3.18833],
      streetName: 'Nearby parking',
      turn: 'arrive',
      distanceMeters: 0,
      durationSeconds: 0,
      travelMode: 'cycling',
    });
  });

  it('describes local short route instructions as a straight distance', () => {
    expect(
      describeCycleRouteInstruction({
        id: 'short',
        anchor: [55.9533, -3.1883],
        streetName: '',
        turn: 'straight',
        distanceMeters: 4.4,
        durationSeconds: 1,
        travelMode: 'walking',
      }),
    ).toBe('Straight 4 m');
  });

  it('describes arrival instructions', () => {
    expect(
      describeCycleRouteInstruction({
        id: 'arrival-near',
        anchor: [55.95332, -3.18833],
        streetName: 'Nearby parking',
        turn: 'arrive',
        distanceMeters: 0,
        durationSeconds: 0,
        travelMode: 'cycling',
      }),
    ).toBe('Arrive at Nearby parking');
  });

  it('throws useful errors for CycleStreets errors and malformed responses', () => {
    expect(() =>
      parseCycleStreetsRoute({ error: 'No routes to plan' }, destination),
    ).toThrow('No routes to plan');
    expect(() =>
      parseCycleStreetsRoute(
        { type: 'FeatureCollection', features: [] },
        destination,
      ),
    ).toThrow('CycleStreets did not return a usable route.');
  });
});
