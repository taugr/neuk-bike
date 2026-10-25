import { describe, expect, it } from 'vitest';
import { weatherGridBounds } from './weather-grid';
import { rainRegion, parseRain, rainAt } from './rain';
import { windRegion, parseRegionalWind } from './regional-wind';
import { sampleProviderWind } from './provider-wind';

const countries = {
  Scotland: { west: -8, east: -0.5, south: 54.6, north: 61 },
  UK: { west: -9, east: 2, south: 49.8, north: 61 },
  Ireland: { west: -11, east: -5.2, south: 51.3, north: 55.5 },
  Spain: { west: -19, east: 4.5, south: 27, north: 44 },
  Armenia: { west: 43.4, east: 46.7, south: 38.8, north: 41.4 },
};
const now = Date.parse('2026-10-26T12:10:00Z');

describe('weather across map scales', () => {
  for (const [name, view] of Object.entries(countries)) {
    it(`covers the whole ${name} view with a bounded rain and wind request`, () => {
      for (const region of [rainRegion(view)!, windRegion(view)!]) {
        expect(region).not.toBeNull();
        expect(region.points).toHaveLength(20);
        expect(new Set(region.points.map((p) => p.join(','))).size).toBe(20);
        expect(region.bounds.west).toBeLessThanOrEqual(view.west);
        expect(region.bounds.east).toBeGreaterThanOrEqual(view.east);
        expect(region.bounds.south).toBeLessThanOrEqual(view.south);
        expect(region.bounds.north).toBeGreaterThanOrEqual(view.north);
        expect(
          new URL(region.url).searchParams.get('latitude')!.split(','),
        ).toHaveLength(20);
      }
      const rain = rainRegion(view)!;
      const snapshot = parseRain(
        rain.points.map(([longitude, latitude], i) => ({
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
            rain: i % 5 < 2 ? 0 : 1,
            showers: 0,
          },
        })),
        rain,
        now,
      )!;
      expect(rainAt(snapshot, ...rain.points[5])?.rate).toBe(0);
      expect(rainAt(snapshot, ...rain.points[9])?.rate).toBe(4);
      expect(rainAt(snapshot, rain.bounds.west - 0.1, view.south)).toBeNull();

      const wind = windRegion(view)!;
      const forecast = parseRegionalWind(
        wind.points.map(([longitude, latitude], i) => ({
          longitude,
          latitude,
          utc_offset_seconds: 0,
          hourly_units: { wind_speed_10m: 'm/s', wind_direction_10m: '°' },
          hourly: {
            time: ['2026-10-26T12:00'],
            wind_speed_10m: [3 + (i % 5)],
            wind_direction_10m: [180],
          },
        })),
        wind,
        now,
        now,
      )!;
      expect(forecast).not.toBeNull();
      expect(
        sampleProviderWind(forecast.grid!, [view.west, view.south]).status,
      ).toBe('estimated');
      expect(
        sampleProviderWind(forecast.grid!, [view.east, view.north]).status,
      ).toBe('estimated');
      expect(
        sampleProviderWind(forecast.grid!, [wind.bounds.east + 0.1, view.north])
          .status,
      ).toBe('unsupported');
    });
  }

  it('refines country samples on zoom-in and reuses quantized grids after small pans', () => {
    const local = { west: -3.21, east: -3.19, south: 55.94, north: 55.96 };
    for (const region of [rainRegion, windRegion]) {
      const fine = region(local)!;
      const country = region(countries.Scotland)!;
      expect(fine.bounds.east - fine.bounds.west).toBeLessThan(
        country.bounds.east - country.bounds.west,
      );
      expect(fine.key).not.toBe(country.key);
      expect(region({ ...local, west: local.west + 0.00001 })?.key).toBe(
        fine.key,
      );
      expect(region(local)?.key).toBe(fine.key);
    }
  });

  it('pads both sides at scale boundaries and clips samples to geographic limits', () => {
    for (const extent of [
      0.039, 0.041, 0.149, 0.151, 0.499, 0.501, 1.49, 1.51, 2.99, 3.01, 5.99,
      6.01, 12, 24, 48, 96,
    ]) {
      for (const centre of [-40.13, 0, 44.52]) {
        const view = {
          west: centre - extent / 2,
          east: centre + extent / 2,
          south: -extent / 2,
          north: extent / 2,
        };
        const grid = weatherGridBounds(view)!;
        expect(grid.west).toBeLessThanOrEqual(view.west);
        expect(grid.east).toBeGreaterThanOrEqual(view.east);
        expect(grid.south).toBeLessThanOrEqual(view.south);
        expect(grid.north).toBeGreaterThanOrEqual(view.north);
      }
    }
    for (const region of [rainRegion, windRegion]) {
      const edge = region({ west: 179, east: 180, south: 78, north: 80 })!;
      expect(edge.points.every(([lng, lat]) => lng <= 180 && lat <= 80)).toBe(
        true,
      );
      expect(region({ west: 10, east: -10, south: 40, north: 60 })).toBeNull();
      expect(region({ west: -10, east: 10, south: NaN, north: 60 })).toBeNull();
    }
  });
});
