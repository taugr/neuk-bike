import { describe, expect, it } from 'vitest';
import {
  parseRain,
  rainAt,
  rainFresh,
  rainOverlaps,
  rainRegion,
  rainStrength,
  RAIN_MAX_AGE,
} from './rain';
const now = Date.parse('2026-10-23T12:15:00Z');
const bounds = { west: -3.21, east: -3.19, south: 55.94, north: 55.96 };
const region = rainRegion(bounds)!;
const payload = () =>
  region.points.map(([longitude, latitude]) => ({
    longitude,
    latitude,
    elevation: 50,
    current_units: {
      time: 'unixtime',
      interval: 'seconds',
      rain: 'mm',
      showers: 'mm',
    },
    current: {
      time: now / 1000,
      interval: 900,
      rain: 0.1,
      showers: 0.2,
      snowfall: 5,
    },
  }));
describe('current rain', () => {
  it('requests only liquid rain and showers on a stable public grid', () => {
    const url = new URL(region.url);
    expect(url.searchParams.get('current')).toBe('rain,showers');
    expect(url.searchParams.has('hourly')).toBe(false);
    expect(region.points).toHaveLength(20);
    expect(rainRegion({ ...bounds, east: bounds.east + 0.00001 })?.key).toBe(
      region.key,
    );
    expect(region.bounds.west).toBeLessThanOrEqual(bounds.west);
    expect(region.bounds.east).toBeGreaterThanOrEqual(bounds.east);
    for (const latitude of [40.18, 53.35, 51.5, 40.42])
      expect(
        rainRegion({
          west: 0,
          east: 0.02,
          south: latitude,
          north: latitude + 0.02,
        }),
      ).not.toBeNull();
    expect(rainRegion({ ...bounds, east: 0 })).toBeNull();
    expect(rainRegion({ ...bounds, north: NaN })).toBeNull();
  });
  it('normalizes the actual accumulation interval without including snow', () => {
    const data = payload();
    expect(parseRain(data, region, now)?.samples[0].rate).toBeCloseTo(1.2);
    data[0].current.interval = 3600;
    expect(parseRain(data, region, now)?.samples[0].rate).toBeCloseTo(0.3);
    data.forEach((r) => {
      r.current.rain = 0;
      r.current.showers = 0;
    });
    expect(
      parseRain(data, region, now)?.samples.every((p) => p.rate === 0),
    ).toBe(true);
    expect(rainStrength(0)).toBe(0);
    expect(rainStrength(20)).toBeGreaterThan(rainStrength(0.2));
  });
  it('rejects partial, invalid, stale or future observations instead of treating them as dry', () => {
    expect(parseRain(payload().slice(1), region, now)).toBeNull();
    for (const change of [
      { rain: null },
      { rain: -1 },
      { showers: NaN },
      { interval: 0 },
      { time: (now - RAIN_MAX_AGE) / 1000 },
      { time: (now + 600000) / 1000 },
    ]) {
      const data = payload();
      Object.assign(data[0].current, change);
      expect(parseRain(data, region, now)).toBeNull();
    }
    const data = payload();
    data[0].current_units.rain = 'inch';
    expect(parseRain(data, region, now)).toBeNull();
  });
  it('expires by valid time as well as retrieval time, including after sleep', () => {
    const rain = parseRain(payload(), region, now)!;
    expect(rainFresh(rain, now)).toBe(true);
    expect(rainFresh(rain, now + RAIN_MAX_AGE)).toBe(false);
    expect(
      rainFresh({ ...rain, fetchedAt: now + RAIN_MAX_AGE }, now + RAIN_MAX_AGE),
    ).toBe(false);
    expect(rainFresh(rain, now - 1)).toBe(false);
  });
  it('keeps dry vertices dry, blends adjacent wet cells and never extrapolates', () => {
    const rain = parseRain(payload(), region, now)!;
    rain.samples[0].rate = 0;
    expect(rainAt(rain, region.bounds.west, region.bounds.south)?.rate).toBe(0);
    const a = region.points[0],
      b = region.points[1];
    expect(rainAt(rain, (a[0] + b[0]) / 2, a[1])?.rate).toBeCloseTo(0.6);
    expect(rainAt(rain, region.bounds.east + 0.01, a[1])).toBeNull();
  });
  it('retains overlapping coverage across request grids but not distant areas', () => {
    const rain = parseRain(payload(), region, now)!;
    const adjacent = {
      ...bounds,
      west: region.bounds.east - 0.005,
      east: region.bounds.east + 0.015,
    };
    expect(rainRegion(adjacent)?.key).not.toBe(region.key);
    expect(rainOverlaps(rain, adjacent)).toBe(true);
    expect(rainAt(rain, adjacent.east, adjacent.south)).toBeNull();
    expect(
      rainOverlaps(rain, {
        ...adjacent,
        west: region.bounds.east,
      }),
    ).toBe(false);
    expect(rainOverlaps(rain, { ...bounds, south: 40, north: 41 })).toBe(false);
  });
});
