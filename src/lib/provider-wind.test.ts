import { describe, expect, it } from 'vitest';
import capture from './fixtures/ukv-edinburgh-2026-10-15.json';
import {
  parseProviderWind,
  sampleProviderWind,
  validProviderGrid,
  PROVIDER_GRID_URL,
  PROVIDER_MAX_AGE,
} from './provider-wind';
import {
  parseOpenMeteoWind,
  scoreWindRoute,
  windProjection,
  windStatus,
  windDestination,
  sampleWindAt,
  compareWindRoutes,
} from './wind';
import { createWindTestRoutes } from '../../test/fixtures/wind-routes';
const now = Date.parse('2026-10-15T20:00:00Z');
const captured = Date.parse(capture.provenance.grid.capturedAt);
const response = capture.grid.slice(0, 20);
const wind = parseProviderWind(response, captured, now)!;
const grid = wind.grid!;
const mutate = (change: (v: typeof response) => void) => {
  const v = structuredClone(response);
  change(v);
  return v;
};

describe('actual captured UKV grid comparison', () => {
  it('uses twenty distinct returned cells, with nearby control requests proving no artificial oversampling', () => {
    expect(wind).not.toBeNull();
    expect(new Set(grid.cells.map((c) => c.point.join(':'))).size).toBe(20);
    expect(grid.cells.some((c) => c.point.join() !== c.requested.join())).toBe(
      true,
    );
    for (const control of capture.grid.slice(20)) {
      expect([control.latitude, control.longitude]).toEqual([
        capture.baseline.latitude,
        capture.baseline.longitude,
      ]);
      expect(control.hourly).toEqual(capture.baseline.hourly);
    }
    const baseline = parseOpenMeteoWind(capture.baseline, captured, now)!;
    expect(baseline.speed).toBe(2.6);
    expect(baseline.from).toBe(222);
    expect(Math.min(...grid.cells.map((c) => c.speed))).toBe(1.9);
    expect(Math.max(...grid.cells.map((c) => c.speed))).toBe(6.2);
    expect(grid.validAt).toBe('2026-10-15T20:00Z');
    expect(grid.sourceUrl).toBe(PROVIDER_GRID_URL);
  });
  it('returns each original sample at its actual position and bounds interpolated speeds', () => {
    for (const cell of grid.cells) {
      const s = sampleProviderWind(grid, cell.point);
      expect(s.status).toBe('estimated');
      expect(s.speed).toBeCloseTo(cell.speed, 6);
      expect(s.from).toBeCloseTo(cell.from, 6);
    }
    for (let lat = 55.91; lat < 56; lat += 0.008)
      for (let lng = -3.35; lng < -3.05; lng += 0.012) {
        const s = sampleProviderWind(grid, [lng, lat]);
        expect(s.status).toBe('estimated');
        expect(s.speed).toBeLessThanOrEqual(6.2);
        expect(s.speed).toBeGreaterThan(0);
      }
  });
  it('has continuous signed vectors across a shared cell edge, including north wrap and opposing cancellation', () => {
    const edge = grid.cells[7].point;
    const left = sampleProviderWind(grid, [edge[0] - 1e-7, edge[1]]),
      right = sampleProviderWind(grid, [edge[0] + 1e-7, edge[1]]);
    expect(Math.abs(left.speed - right.speed)).toBeLessThan(0.0001);
    expect(Math.abs(left.from - right.from)).toBeLessThan(0.001);
    const synthetic = structuredClone(grid);
    synthetic.cells.forEach((c, i) => {
      c.speed = 5;
      c.from = i % 5 === 0 ? 359 : 1;
    });
    const a = synthetic.cells[0].point,
      b = synthetic.cells[1].point;
    const midpoint: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const north = sampleProviderWind(synthetic, midpoint);
    expect(Math.min(north.from, 360 - north.from)).toBeLessThan(0.001);
    synthetic.cells[0].from = 0;
    synthetic.cells[1].from = 180;
    expect(sampleProviderWind(synthetic, midpoint).status).toBe('variable');
    synthetic.cells.forEach((c) => (c.speed = 0));
    expect(sampleProviderWind(synthetic, midpoint)).toMatchObject({
      status: 'estimated',
      speed: 0,
    });
  });
  it('never extrapolates outside the returned mesh', () => {
    for (const p of [
      [-3.5, 55.95],
      [-3.2, 56.1],
      [NaN, 55.95],
      [-3.3686, 55.9043],
    ] as [number, number][])
      expect(sampleProviderWind(grid, p).status).toBe('unsupported');
  });
  it('samples the same local airflow for arrows and route scores with the original safety caps', () => {
    const point: [number, number] = [-3.2, 55.95],
      sample = sampleWindAt(wind, point);
    expect(sample).toEqual(sampleProviderWind(grid, point));
    const destination = windDestination(point, sample)!;
    expect(destination[0]).toBeGreaterThan(point[0]);
    expect(destination[1]).toBeGreaterThan(point[1]);
    expect(windProjection(sample.from, sample)).toBeCloseTo(sample.speed);
    expect(windProjection((sample.from + 180) % 360, sample)).toBeCloseTo(
      -sample.speed,
    );
    const { routes } = createWindTestRoutes();
    expect(scoreWindRoute(routes.balanced!, wind)).not.toBeNull();
    const result = compareWindRoutes(routes, 'balanced', wind, captured);
    expect(result.plan).not.toBe('fastest');
    expect(result.extraSeconds).toBeLessThanOrEqual(100);
    expect(result.extraMeters).toBeLessThanOrEqual(150);
  });
  it('selects aligned valid hours without relabelling old data or accepting expired captures', () => {
    expect(parseProviderWind(response, captured, now + 3600000)?.validAt).toBe(
      '2026-10-15T21:00Z',
    );
    expect(
      parseProviderWind(response, captured, now + 3 * 86400000),
    ).toBeNull();
    const future = parseProviderWind(
      response,
      captured,
      captured + PROVIDER_MAX_AGE + 1,
    )!;
    expect(windStatus(future, captured + PROVIDER_MAX_AGE + 1)).toBe('stale');
    expect(windStatus(wind, captured)).toBe('fresh');
  });
  it.each([
    (v: typeof response) => {
      v[0].hourly_units.wind_speed_10m = 'km/h';
    },
    (v: typeof response) => {
      v[0].utc_offset_seconds = 3600;
    },
    (v: typeof response) => {
      v[0].latitude = 0;
    },
    (v: typeof response) => {
      v[1].latitude = v[0].latitude;
      v[1].longitude = v[0].longitude;
    },
    (v: typeof response) => {
      v[0].hourly.wind_speed_10m[20] = NaN;
    },
    (v: typeof response) => {
      v[0].hourly.wind_direction_10m[20] = 361;
    },
    (v: typeof response) => {
      v[0].hourly.time[20] = '2026-10-15T20:30';
    },
  ])('rejects inconsistent units, positions, values and times', (change) =>
    expect(parseProviderWind(mutate(change), captured, now)).toBeNull(),
  );
  it('rejects wrong model, request provenance or response count', () => {
    expect(
      validProviderGrid({ ...grid, sourceUrl: 'https://example.com' }),
    ).toBe(false);
    expect(parseProviderWind(response.slice(1), captured, now)).toBeNull();
    expect(parseProviderWind(capture.baseline, captured, now)).toBeNull();
  });
});
