import { describe, expect, it } from 'vitest';
import raw from './edinburgh-stations-2026-10-15.json';
import {
  parseStationSnapshot,
  sampleStationWind,
  stationRejection,
  stationSnapshotWind,
  stationSnapshotLabel,
  STATION_LIMITS,
  type StationSnapshot,
} from './station-wind';
import { compareWindRoutes, scoreWindRoute, windStatus } from './wind';
import { createWindTestRoutes } from '../../test/fixtures/wind-routes';

const snapshot = parseStationSnapshot(raw)!;
const captured = Date.parse(snapshot.capturedAt);
const station = snapshot.stations[1];
const synthetic = (
  directions: number[],
  speeds = directions.map(() => 5),
): StationSnapshot => ({
  ...snapshot,
  stations: directions.map((direction, i) => ({
    ...station,
    id: String(i),
    point: [-3.2, 55.95],
    direction,
    speed: speeds[i],
  })),
});

describe('captured public station observations', () => {
  it('preserves observed/capture time and documented original units', () => {
    expect(snapshot).not.toBeNull();
    const airport = snapshot.stations[0];
    expect(airport.observedAt).toBe('2026-10-15T15:50:00Z');
    expect(stationRejection(airport, captured)).toBe('Too old at capture');
    expect(station.observedAt).toBe('2026-10-15T19:16:33Z');
    expect(station.timezoneInferred).toBe(true);
    expect(station.speed).toBe(7);
    expect(station.gust).toBe(8.4);
    expect(snapshot.stations[2].speed).toBeCloseTo((7.9 * 1852) / 3600);
    expect(snapshot.stations[3].speed).toBeCloseTo((9.6 * 1852) / 3600);
    expect(snapshot.stations[2].direction).toBe(247.5);
  });
  it('produces spatial differences from the actual readings, not invented observations', () => {
    const south = sampleStationWind(snapshot, [-3.1743, 55.9216]);
    const north = sampleStationWind(snapshot, [-3.17184, 55.9798]);
    expect(south.status).toBe('estimated');
    expect(north.status).toBe('estimated');
    expect(south.speed - north.speed).toBeGreaterThan(1.5);
    expect(north.from - south.from).toBeGreaterThan(15);
    expect(south.contributors.map((x) => x.id)).not.toContain('EGPH');
    expect(
      south.contributors.reduce((sum, x) => sum + x.weight, 0),
    ).toBeCloseTo(1);
  });
  it.each([
    { direction: 'VRB' },
    { direction: null },
    { speed: NaN },
    { speed: -1 },
    { observedAt: 'bad' },
    { observedAt: '2026-10-15T22:00:00Z' },
    { point: [NaN, 0] as [number, number] },
    { positionUncertaintyM: -1 },
  ])('excludes invalid readings: %j', (patch) => {
    expect(stationRejection({ ...station, ...patch }, captured)).not.toBeNull();
  });
  it('requires two nearby supported readings and finite coverage', () => {
    expect(
      sampleStationWind({ ...snapshot, stations: [station] }, station.point)
        .status,
    ).toBe('unsupported');
    for (const point of [
      [-3.59, 56.14],
      [-2.8, 55.95],
      [NaN, 55.95],
    ] as [number, number][])
      expect(sampleStationWind(snapshot, point).status).toBe('unsupported');
  });
  it('averages vectors across north and identifies opposing winds without calling them calm', () => {
    const north = sampleStationWind(synthetic([359, 1]), [-3.2, 55.95]);
    expect(Math.min(north.from, 360 - north.from)).toBeLessThan(0.01);
    expect(north.speed).toBeCloseTo(5, 2);
    expect(sampleStationWind(synthetic([0, 180]), [-3.2, 55.95]).status).toBe(
      'variable',
    );
    const calm = sampleStationWind(synthetic([0, 180], [0, 0]), [-3.2, 55.95]);
    expect(calm.status).toBe('estimated');
    expect(calm.speed).toBe(0);
  });
  it('keeps historical display labelled and stops routing after 90 minutes', () => {
    const wind = stationSnapshotWind(snapshot);
    const { routes } = createWindTestRoutes();
    expect(windStatus(wind, captured + 86400000)).toBe('snapshot');
    expect(stationSnapshotLabel(snapshot)).toContain('15 Oct 2026');
    expect(stationSnapshotLabel(snapshot)).toContain('snapshot, not live');
    expect(scoreWindRoute(routes.balanced!, wind)).not.toBeNull();
    expect(
      compareWindRoutes(
        routes,
        'balanced',
        wind,
        captured + STATION_LIMITS.ageMs + 1,
      ).reason,
    ).toBe('stale');
    expect(
      compareWindRoutes(
        routes,
        'balanced',
        stationSnapshotWind(synthetic([0, 180])),
        captured,
      ).reason,
    ).toBe('uncertain');
  });
  it('rejects malformed metadata without treating invalid readings as observations', () => {
    expect(parseStationSnapshot({ ...raw, stations: [] })).toBeNull();
    expect(
      parseStationSnapshot({
        ...raw,
        stations: [{ ...station, source: { url: 'javascript:alert(1)' } }],
      }),
    ).toBeNull();
    expect(
      parseStationSnapshot({
        ...raw,
        coverage: { west: 0, east: 0, north: 1, south: 0 },
      }),
    ).toBeNull();
  });
});
