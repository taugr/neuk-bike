import { describe, expect, it } from 'vitest';
import {
  windRegion,
  parseRegionalWind,
  reserveWindRequest,
  useEdinburghGrid,
  windRequestBounds,
} from './regional-wind';
import { sampleProviderWind } from './provider-wind';
import { scoreWindRoute, compareWindRoutes, windStatus } from './wind';
import { createWindTestRoutes } from '../../test/fixtures/wind-routes';
const now = Date.parse('2026-10-16T16:20:00Z');
const bounds = { west: 44.49, east: 44.55, south: 40.15, north: 40.2 };
const region = windRegion(bounds)!;
function response() {
  return region.points.map(([longitude, latitude]) => ({
    longitude,
    latitude,
    utc_offset_seconds: 0,
    hourly_units: { wind_speed_10m: 'm/s', wind_direction_10m: '°' },
    hourly: {
      time: ['2026-10-16T16:00', '2026-10-16T17:00'],
      wind_speed_10m: [5, 6],
      wind_direction_10m: [350, 10],
    },
  }));
}
describe('bounded regional wind', () => {
  it('quantizes requests, limits size and fields, and does not send exact route coordinates', () => {
    expect(region.points).toHaveLength(20);
    expect(windRegion({ ...bounds, west: 44.491 })?.key).toBe(region.key);
    expect(region.url).not.toContain('44.49');
    expect(new URL(region.url).searchParams.get('hourly')).toBe(
      'wind_speed_10m,wind_direction_10m',
    );
    expect(new URL(region.url).searchParams.get('models')).toBe('best_match');
    expect(windRegion({ ...bounds, east: 47 })?.points).toHaveLength(20);
    expect(windRegion({ ...bounds, west: NaN })).toBeNull();
  });
  it('preserves every original vector and refuses extrapolation', () => {
    const wind = parseRegionalWind(response(), region, now, now)!;
    expect(wind.grid!.cells).toHaveLength(20);
    for (const cell of wind.grid!.cells) {
      const s = sampleProviderWind(wind.grid!, cell.point);
      expect(s.status).toBe('estimated');
      expect(s.speed).toBeCloseTo(5);
      expect(s.from).toBeCloseTo(350);
    }
    expect(sampleProviderWind(wind.grid!, [44.52, 40.18]).status).toBe(
      'estimated',
    );
    expect(sampleProviderWind(wind.grid!, [-3.18, 55.95]).status).toBe(
      'unsupported',
    );
    expect(windStatus(wind, now + 3 * 3600000)).toBe('stale');
  });
  it('deduplicates actual cells without manufacturing independent samples', () => {
    const data = response();
    // A coarse provider returns the same cell for two neighbouring requests.
    for (let row = 0; row < 4; row++)
      data[row * 5 + 1] = structuredClone(data[row * 5]);
    const wind = parseRegionalWind(data, region, now, now)!;
    expect(wind.grid!.cells).toHaveLength(16);
    expect(sampleProviderWind(wind.grid!, [44.6, 40.2]).status).toBe(
      'estimated',
    );
    data[1].hourly.wind_speed_10m[0] = 9;
    expect(parseRegionalWind(data, region, now, now)).toBeNull();
  });
  it('uses signed vectors across edges and represents opposing wind as variable', () => {
    const wind = parseRegionalWind(response(), region, now, now)!;
    const grid = wind.grid!;
    grid.cells.forEach((c, i) => {
      c.from = i % 5 === 0 ? 359 : 1;
    });
    const a = grid.cells[0].point,
      b = grid.cells[1].point;
    const midpoint: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const s = sampleProviderWind(grid, midpoint);
    expect(Math.min(s.from, 360 - s.from)).toBeLessThan(0.001);
    grid.cells[0].from = 0;
    grid.cells[1].from = 180;
    expect(sampleProviderWind(grid, midpoint).status).toBe('variable');
  });
  it('rejects malformed, misaligned, remote and inconsistent responses', () => {
    for (const change of [
      (v: ReturnType<typeof response>) => {
        v[0].longitude = 0;
      },
      (v: ReturnType<typeof response>) => {
        v[0].hourly.time[0] = '2026-10-16T15:00';
      },
      (v: ReturnType<typeof response>) => {
        v[0].hourly_units.wind_speed_10m = 'km/h';
      },
      (v: ReturnType<typeof response>) => {
        v[0].hourly.wind_speed_10m[0] = NaN;
      },
    ]) {
      const v = response();
      change(v);
      expect(parseRegionalWind(v, region, now, now)).toBeNull();
    }
  });
  it('scores supported geometry and leaves an outside route unchanged', () => {
    const wind = parseRegionalWind(response(), region, now, now)!;
    const demo = createWindTestRoutes();
    const baseline = Object.values(demo.routes)[0];
    expect(scoreWindRoute(baseline, wind)).toBeNull();
    expect(
      compareWindRoutes(demo.routes, baseline.plan, wind, now).reason,
    ).toBe('uncertain');
    const inside = {
      ...baseline,
      points: [
        [40.18, 44.52],
        [40.19, 44.53],
      ] as [number, number][],
    };
    expect(scoreWindRoute(inside, wind)).not.toBeNull();
    inside.points.push([40.2, 46]);
    expect(scoreWindRoute(inside, wind)).toBeNull();
  });
  it('covers all candidate route bounds and bounds long journeys to the current map', () => {
    const country = { west: 43, east: 47, south: 38, north: 42 };
    expect(
      windRequestBounds(country, [
        [
          [44.4, 40.1],
          [44.7, 40.3],
        ],
      ]),
    ).toEqual(country);
    expect(
      windRequestBounds(bounds, [
        [
          [44.4, 40.1],
          [44.7, 40.3],
        ],
      ]),
    ).toEqual({
      west: 44.39,
      east: 44.71,
      south: 40.09,
      north: 40.309999999999995,
    });
    expect(
      windRequestBounds(bounds, [
        [
          [0, 40],
          [44, 40],
        ],
      ]),
    ).toEqual(bounds);
    expect(useEdinburghGrid(bounds)).toBe(false);
    expect(
      useEdinburghGrid(
        { west: -3.25, east: -3.15, south: 55.93, north: 55.98 },
        true,
      ),
    ).toBe(true);
  });
  it('counts requests conservatively and enforces cooldown, hourly and daily budgets', () => {
    expect(reserveWindRequest([], now).wait).toBe(0);
    expect(reserveWindRequest([now], now + 500).wait).toBe(9500);
    expect(
      reserveWindRequest(
        Array.from({ length: 50 }, (_, i) => now - (i + 1) * 20000).sort(),
        now,
      ).wait,
    ).toBeGreaterThan(0);
    expect(
      reserveWindRequest(
        Array.from({ length: 250 }, (_, i) => now - (i + 1) * 120000).sort(),
        now,
      ).wait,
    ).toBeGreaterThan(0);
    expect(reserveWindRequest([now - 86400001], now).history).toEqual([now]);
  });
});

import captures from './fixtures/regional-open-meteo-2026-10-16.json';
describe('actual 16 October regional response captures', () => {
  for (const capture of captures)
    it(`supports ${capture.provenance.name} with original coordinates and values`, () => {
      const [lng, lat] = capture.provenance.point;
      const r = windRegion({
        west: lng - 0.01,
        east: lng + 0.01,
        south: lat - 0.01,
        north: lat + 0.01,
      })!;
      const stamp = Date.parse(capture.provenance.capturedAt);
      const w = parseRegionalWind(capture.response, r, stamp, stamp)!;
      expect(w).not.toBeNull();
      expect(w.grid!.cells.length).toBe(capture.provenance.distinct);
      expect(sampleProviderWind(w.grid!, [lng, lat]).status).not.toBe(
        'unsupported',
      );
      for (const c of w.grid!.cells) {
        const s = sampleProviderWind(w.grid!, c.point);
        expect(s.status).toBe('estimated');
        expect(s.speed).toBeCloseTo(c.speed, 5);
        if (c.speed > 0) expect(s.from % 360).toBeCloseTo(c.from % 360, 5);
      }
    });
});
