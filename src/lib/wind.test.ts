import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CycleRoute, CycleRoutePlan } from './cyclestreets';
import {
  compareWindRoutes,
  formatWindSpeed,
  parseOpenMeteoWind,
  parseWindForecast,
  scoreWindRoute,
  screenBearing,
  windCovers,
  windDestination,
  windProjection,
  windStatus,
  type WindForecast,
} from './wind';
import { createWindTestRoutes } from '../../test/fixtures/wind-routes';

const wind: WindForecast = {
  kind: 'forecast',
  speed: 5,
  from: 90,
  units: 'm/s',
  capturedAt: '2026-10-13T18:58:37Z',
  validAt: '2026-10-14T07:00:00Z',
  coverage: { west: -3.4, east: -3, south: 55.88, north: 56.02 },
};
const now = Date.parse('2026-10-14T07:00:00Z');
beforeEach(() => {
  vi.useFakeTimers({ now });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('permitted private-preview forecast adapter', () => {
  it('rejects the retired station snapshot as a forecast', () => {
    expect(parseWindForecast({ ...wind, kind: 'station-snapshot' })).toBeNull();
  });
  const response = {
    latitude: 55.959354,
    longitude: -3.1747131,
    utc_offset_seconds: 0,
    hourly_units: { wind_speed_10m: 'm/s', wind_direction_10m: '°' },
    hourly: {
      time: ['2026-10-14T07:00', '2026-10-14T08:00'],
      wind_speed_10m: [4.4, 5],
      wind_direction_10m: [194, 200],
    },
  };
  it('selects the current UTC hour, with the fetch time separate from forecast validity', () => {
    expect(parseOpenMeteoWind(response, now, now + 3600000)).toMatchObject({
      kind: 'forecast',
      speed: 5,
      from: 200,
      capturedAt: '2026-10-14T07:00:00.000Z',
      validAt: '2026-10-14T08:00Z',
    });
    expect(parseOpenMeteoWind(response, now, now + 2 * 3600000)).toBeNull();
  });
  it('rejects wrong units, timezone, location and missing direction', () => {
    for (const value of [
      null,
      {},
      { ...response, utc_offset_seconds: 3600 },
      { ...response, latitude: NaN },
      { ...response, latitude: 51 },
      { ...response, hourly_units: { wind_speed_10m: 'km/h' } },
      {
        ...response,
        hourly: { ...response.hourly, wind_direction_10m: [null] },
      },
    ]) {
      expect(parseOpenMeteoWind(value, now, now)).toBeNull();
    }
  });
  it('only compares routes returned by the cycling provider', () => {
    const { routes } = createWindTestRoutes();
    expect(
      compareWindRoutes(routes, 'balanced', { ...wind, from: 194 }, now).plan,
    ).toBe('quietest');
    const local = {
      ...routes,
      balanced: { ...routes.balanced!, source: 'local' as const },
    };
    expect(
      compareWindRoutes(local, 'balanced', { ...wind, from: 194 }, now).reason,
    ).toBe('unavailable');
  });
});
const point = (x: number, y: number): [number, number] => [
  55.95 + y / 111194.9266,
  -3.2 + x / (111194.9266 * Math.cos((55.95 * Math.PI) / 180)),
];
function route(
  plan: CycleRoutePlan,
  xy: [number, number][] = [
    [0, 0],
    [1000, 0],
  ],
): CycleRoute {
  const r: CycleRoute = {
    plan,
    source: 'cyclestreets',
    points: xy.map(([x, y]) => point(x, y)),
    durationSeconds: 1000,
    distanceMeters: 1000,
    instructions: [],
  };
  r.distanceMeters = scoreWindRoute(r, wind)!.distance;
  return r;
}
const balanced = route('balanced');
const quietest = {
  ...route('quietest', [
    [0, 0],
    [500, 200],
    [1000, 0],
  ]),
  durationSeconds: 1050,
};

describe('area-wide forecast validation', () => {
  it('rejects retired demo data and expires historical forecasts', () => {
    expect(parseWindForecast({ ...wind, kind: 'demo' })).toBeNull();
    expect(windStatus(wind, now + 365 * 86400000)).toBe('stale');
  });
  it('rejects missing data, wrong units, invalid bounds and nonfinite wind', () => {
    for (const value of [
      null,
      {},
      { ...wind, speed: NaN },
      { ...wind, speed: -1 },
      { ...wind, units: 'km/h' },
      { ...wind, from: null },
      { ...wind, validAt: '' },
      { ...wind, coverage: { ...wind.coverage, north: -90 } },
    ]) {
      expect(parseWindForecast(value)).toBeNull();
    }
    expect(parseWindForecast({ ...wind, from: -90 })?.from).toBe(270);
  });
  it('fails closed on stale, future-captured or wrong-hour live forecasts', () => {
    const live = { ...wind, kind: 'forecast' as const };
    expect(windStatus(live, now)).toBe('fresh');
    expect(windStatus(live, now + 2 * 3600000)).toBe('stale');
    expect(windStatus({ ...live, capturedAt: '2026-10-14T08:00Z' }, now)).toBe(
      'stale',
    );
    expect(windStatus({ ...live, capturedAt: '2026-10-10T07:00Z' }, now)).toBe(
      'stale',
    );
    expect(
      compareWindRoutes(
        { balanced, quietest },
        'balanced',
        live,
        now + 2 * 3600000,
      ).reason,
    ).toBe('stale');
    expect(
      compareWindRoutes({ balanced, quietest }, 'balanced', null).reason,
    ).toBe('missing');
  });
});

describe('air movement and route scoring', () => {
  it('distinguishes wind FROM from air travel TO', () => {
    expect(windProjection(90, { speed: 5, from: 270 })).toBeCloseTo(-5);
    expect(windProjection(270, { speed: 5, from: 270 })).toBeCloseTo(5);
    const east = windDestination([-3.2, 55.95], { speed: 5, from: 270 })!;
    expect(east[0]).toBeGreaterThan(-3.2);
    expect(east[1]).toBeCloseTo(55.95);
    expect(windDestination([-3.2, 55.95], { speed: 0, from: 270 })).toBeNull();
  });
  it('derives bearing through screen projection, including rotated maps', () => {
    expect(screenBearing({ x: 0, y: 0 }, { x: 10, y: 0 })).toBe(90);
    expect(screenBearing({ x: 0, y: 0 }, { x: 0, y: -10 })).toBe(0);
    expect(screenBearing({ x: 0, y: 0 }, { x: 0, y: 10 })).toBe(180);
    expect(screenBearing({ x: 0, y: 0 }, { x: 0, y: 0 })).toBeNull();
  });
  it('preserves scores across subdivision and zero-length segments', () => {
    const subdivided = route('balanced', [
      [0, 0],
      [250, 0],
      [250, 0],
      [500, 0],
      [1000, 0],
    ]);
    expect(scoreWindRoute(subdivided, wind)!.burden).toBeCloseTo(
      scoreWindRoute(balanced, wind)!.burden,
      8,
    );
  });
  it('only scores complete geometry inside the forecast area', () => {
    expect(windCovers(wind, [-4, 55.95])).toBe(false);
    expect(
      scoreWindRoute(
        {
          ...balanced,
          points: [
            [55.95, -4],
            [55.95, -3.2],
          ],
        },
        wind,
      ),
    ).toBeNull();
    expect(
      scoreWindRoute({ ...balanced, points: [point(0, 0), point(0, 0)] }, wind),
    ).toBeNull();
  });
});

describe('bounded candidate selection', () => {
  it('selects a quieter eligible alternative and reports actual deltas', () => {
    const result = compareWindRoutes({ balanced, quietest }, 'balanced', wind);
    expect(result.plan).toBe('quietest');
    expect(result.reason).toBe('improved');
    expect(result.extraSeconds).toBe(50);
    expect(result.extraMeters).toBeCloseTo(
      quietest.distanceMeters - balanced.distanceMeters,
    );
    expect(quietest.plan).toBe('quietest');
  });
  it('uses the chosen style as baseline, never silently downgrades it', () => {
    expect(
      compareWindRoutes(
        {
          quietest: { ...balanced, plan: 'quietest' },
          fastest: { ...quietest, plan: 'fastest' },
        },
        'quietest',
        wind,
      ).plan,
    ).toBe('quietest');
  });
  it('enforces inclusive 20% time and 25% distance caps', () => {
    expect(
      compareWindRoutes(
        { balanced, quietest: { ...quietest, durationSeconds: 1200 } },
        'balanced',
        wind,
      ).plan,
    ).toBe('quietest');
    expect(
      compareWindRoutes(
        { balanced, quietest: { ...quietest, durationSeconds: 1200.01 } },
        'balanced',
        wind,
      ).plan,
    ).toBe('balanced');
    expect(
      compareWindRoutes(
        {
          balanced,
          quietest: {
            ...quietest,
            distanceMeters: balanced.distanceMeters * 1.25,
          },
        },
        'balanced',
        wind,
      ).plan,
    ).toBe('quietest');
    expect(
      compareWindRoutes(
        {
          balanced,
          quietest: {
            ...quietest,
            distanceMeters: balanced.distanceMeters * 1.25 + 0.01,
          },
        },
        'balanced',
        wind,
      ).plan,
    ).toBe('balanced');
  });
  it('rejects corridor excursions, backtracking, mismatched endpoints and invalid provider metadata', () => {
    const excursion = route('quietest', [
      [0, 0],
      [500, 301],
      [1000, 0],
    ]);
    const backwards = route('quietest', [
      [0, 0],
      [-51, 0],
      [500, 200],
      [1000, 0],
    ]);
    const moved = {
      ...quietest,
      points: quietest.points.map(([lat, lng]): [number, number] => [
        lat + 0.001,
        lng,
      ]),
    };
    for (const candidate of [
      { ...excursion, distanceMeters: 1100 },
      { ...backwards, distanceMeters: 1100 },
      moved,
      { ...quietest, durationSeconds: NaN },
      { ...quietest, distanceMeters: 0 },
      { ...quietest, distanceMeters: 500 },
      { ...quietest, source: 'local' as const },
      { ...quietest, segments: [quietest.points] },
    ])
      expect(
        compareWindRoutes({ balanced, quietest: candidate }, 'balanced', wind)
          .plan,
      ).toBe('balanced');
  });
  it('keeps the baseline for calm/tailwind, no improvement or no alternatives', () => {
    expect(
      compareWindRoutes({ balanced, quietest }, 'balanced', {
        ...wind,
        speed: 0,
      }).reason,
    ).toBe('calm');
    expect(
      compareWindRoutes({ balanced, quietest }, 'balanced', {
        ...wind,
        from: 270,
      }).reason,
    ).toBe('calm');
    expect(
      compareWindRoutes(
        { balanced, quietest: { ...balanced, plan: 'quietest' } },
        'balanced',
        wind,
      ).reason,
    ).toBe('no-improvement');
    expect(compareWindRoutes({ balanced }, 'balanced', wind).reason).toBe(
      'unavailable',
    );
    expect(compareWindRoutes({}, 'balanced', wind).reason).toBe('unavailable');
  });
  it('does not mistake short local routes or imported tracks for provider alternatives', () => {
    expect(
      compareWindRoutes(
        { balanced: { ...balanced, source: 'local' }, quietest },
        'balanced',
        wind,
      ).reason,
    ).toBe('unavailable');
  });
});

describe('forecast speed display', () => {
  it('uses km/h with one decimal for calm and actual forecast values', () => {
    expect(formatWindSpeed(0)).toBe('0.0 km/h');
    expect(formatWindSpeed(4.4)).toBe('15.8 km/h');
    expect(formatWindSpeed(4.456)).toBe('16.0 km/h');
    expect(formatWindSpeed(12)).toBe('43.2 km/h');
  });
});
