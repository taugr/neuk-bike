import { describe, expect, it } from 'vitest';
import {
  parseRain,
  rainAt,
  rainFresh,
  rainOverlaps,
  rainRegion,
  rainStrength,
  RAIN_MAX_AGE,
  weatherCondition,
  weatherSummary,
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
      snowfall: 'cm',
      weather_code: 'wmo code',
    },
    current: {
      time: now / 1000,
      interval: 900,
      rain: 0.1,
      showers: 0.2,
      snowfall: 5,
      weather_code: 63,
    },
  }));
describe('current rain', () => {
  it('requests current liquid rain, snowfall and weather codes on a stable public grid', () => {
    const url = new URL(region.url);
    expect(url.searchParams.get('current')).toBe(
      'rain,showers,snowfall,weather_code',
    );
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
    expect(rainRegion({ ...bounds, east: 0 })?.points).toHaveLength(20);
    expect(rainRegion({ ...bounds, north: NaN })).toBeNull();
  });
  it('normalizes the actual accumulation interval without including snow', () => {
    const data = payload();
    expect(parseRain(data, region, now)?.samples[0].rate).toBeCloseTo(1.2);
    expect(parseRain(data, region, now)?.samples[0].snowRate).toBe(20);
    data[0].current.interval = 3600;
    expect(parseRain(data, region, now)?.samples[0].rate).toBeCloseTo(0.3);
    expect(parseRain(data, region, now)?.samples[0].snowRate).toBe(5);
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
      { snowfall: null },
      { snowfall: -1 },
      { snowfall: Infinity },
      { weather_code: null },
      { weather_code: 95.5 },
      { weather_code: 98 },
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
    const snow = payload();
    snow[0].current_units.snowfall = 'mm';
    expect(parseRain(snow, region, now)).toBeNull();
    const code = payload();
    code[0].current_units.weather_code = 'unknown';
    expect(parseRain(code, region, now)).toBeNull();
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
  it('blends snow amounts but selects weather codes from the nearest sample', () => {
    const rain = parseRain(payload(), region, now)!;
    rain.samples.forEach((p) => {
      p.snowRate = 0;
      p.weatherCode = 0;
    });
    rain.samples[1].snowRate = 2;
    rain.samples[1].weatherCode = 95;
    const [a, b] = region.points;
    const quarter = rainAt(rain, a[0] + (b[0] - a[0]) * 0.25, a[1])!;
    const threeQuarter = rainAt(rain, a[0] + (b[0] - a[0]) * 0.75, a[1])!;
    expect(quarter.snowRate).toBeCloseTo(0.5);
    expect(quarter.weatherCode).toBe(0);
    expect(threeQuarter.snowRate).toBeCloseTo(1.5);
    expect(threeQuarter.weatherCode).toBe(95);
  });
  it.each([
    [0, 0, 3, 'dry'],
    [0, 0, 45, 'fog'],
    [0, 0, 48, 'fog'],
    [0.1, 0, 51, 'drizzle'],
    [1, 0, 61, 'lightRain'],
    [4, 0, 63, 'rain'],
    [12, 0, 65, 'heavyRain'],
    [0, 0.3, 71, 'snow'],
    [0, 2, 75, 'heavySnow'],
    [1, 0.3, 71, 'sleet'],
    [1, 0, 66, 'freezingRain'],
    [0, 0, 95, 'thunderstorm'],
    [4, 0, 97, 'thunderstorm'],
    [12, 0, 96, 'hail'],
    [12, 0, 99, 'hail'],
    [0, 0, 71, 'dry'], // A condition code alone does not invent snow accumulation.
  ] as const)(
    'describes %s mm/h, %s cm/h, code %s as %s',
    (rate, snowRate, weatherCode, expected) => {
      expect(weatherCondition({ rate, snowRate, weatherCode })).toBe(expected);
    },
  );
  it('summarizes visible conditions without borrowing storms outside the view', () => {
    const rain = parseRain(payload(), region, now)!;
    rain.samples.forEach((p) => {
      p.snowRate = 0;
      p.rate = 0;
      p.weatherCode = 0;
    });
    rain.samples[0].weatherCode = 95;
    const b = region.bounds;
    expect(weatherSummary(rain, null)).toBe('thunderstorm');
    expect(
      weatherSummary(rain, {
        ...b,
        west: b.east - 0.001,
        south: b.north - 0.001,
      }),
    ).toBe('dry');
    rain.samples[0].weatherCode = 0;
    rain.samples[0].snowRate = 0.5;
    rain.samples[1].rate = 1;
    expect(weatherSummary(rain, null)).toBe('sleet');
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
