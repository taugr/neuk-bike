import type { ParkingMapBounds } from './map-pins';

export const rainStorageKey = 'bike-neuk-map-rain';
export const RAIN_REFRESH = 15 * 60000;
export const RAIN_MAX_AGE = 30 * 60000;
export type RainPoint = {
  longitude: number;
  latitude: number;
  rate: number;
  elevation: number;
};
export type RainRegion = {
  key: string;
  bounds: ParkingMapBounds;
  points: [number, number][];
  url: string;
};
export type RainSnapshot = {
  key: string;
  bounds: ParkingMapBounds;
  samples: RainPoint[];
  validAt: number;
  fetchedAt: number;
};

/** Public, quantized viewport grid. Never send exact GPS or route coordinates. */
export function rainRegion(bounds: ParkingMapBounds): RainRegion | null {
  const { west, east, south, north } = bounds;
  if (
    ![west, east, south, north].every(Number.isFinite) ||
    west >= east ||
    south >= north ||
    west < -180 ||
    east > 180 ||
    south < -80 ||
    north > 80
  )
    return null;
  const extent = Math.max(east - west, north - south);
  if (extent > 1.5) return null;
  const span =
    extent <= 0.04 ? 0.08 : extent <= 0.15 ? 0.3 : extent <= 0.5 ? 1 : 2;
  const step = span / 4;
  const lng = Math.round((west + east) / 2 / step) * step;
  const lat = Math.round((south + north) / 2 / step) * step;
  const area = {
    west: lng - span / 2,
    east: lng + span / 2,
    south: lat - span / 2,
    north: lat + span / 2,
  };
  const points: [number, number][] = Array.from({ length: 20 }, (_, i) => [
    Number((area.west + ((i % 5) * span) / 4).toFixed(5)),
    Number((area.south + (Math.floor(i / 5) * span) / 3).toFixed(5)),
  ]);
  const query = new URLSearchParams({
    latitude: points.map((p) => p[1]).join(','),
    longitude: points.map((p) => p[0]).join(','),
    current: 'rain,showers',
    timeformat: 'unixtime',
    models: 'best_match',
    cell_selection: 'nearest',
    precipitation_unit: 'mm',
  });
  return {
    key: `rain-v1:${lng.toFixed(5)}:${lat.toFixed(5)}:${span}`,
    bounds: area,
    points,
    url: `https://api.open-meteo.com/v1/forecast?${query}`,
  };
}
export function rainFresh(snapshot: RainSnapshot, now = Date.now()) {
  return (
    now >= snapshot.fetchedAt &&
    now - snapshot.fetchedAt < RAIN_MAX_AGE &&
    snapshot.validAt <= now + 5 * 60000 &&
    now - snapshot.validAt < RAIN_MAX_AGE
  );
}
export function parseRain(
  value: unknown,
  region: RainRegion,
  now = Date.now(),
): RainSnapshot | null {
  if (!Array.isArray(value) || value.length !== region.points.length)
    return null;
  const samples: RainPoint[] = [];
  let validAt = Infinity;
  for (const [i, row] of value.entries()) {
    const c = row?.current,
      units = row?.current_units;
    if (
      !c ||
      units?.rain !== 'mm' ||
      units?.showers !== 'mm' ||
      units?.time !== 'unixtime' ||
      units?.interval !== 'seconds' ||
      ![
        c.time,
        c.interval,
        c.rain,
        c.showers,
        row.longitude,
        row.latitude,
        row.elevation,
      ].every((v) => typeof v === 'number' && Number.isFinite(v)) ||
      c.interval <= 0 ||
      c.interval > 3600 ||
      c.rain < 0 ||
      c.showers < 0 ||
      Math.abs(row.longitude - region.points[i][0]) > 0.5 ||
      Math.abs(row.latitude - region.points[i][1]) > 0.5 ||
      c.time * 1000 > now + 5 * 60000 ||
      now - c.time * 1000 >= RAIN_MAX_AGE
    )
      return null;
    validAt = Math.min(validAt, c.time * 1000);
    // Rain and convective showers are separate liquid accumulations; never use total precipitation (includes snow).
    const rate = ((c.rain + c.showers) * 3600) / c.interval;
    if (!Number.isFinite(rate) || rate > 500) return null;
    samples.push({
      longitude: region.points[i][0],
      latitude: region.points[i][1],
      elevation: row.elevation,
      rate,
    });
  }
  return {
    key: region.key,
    bounds: region.bounds,
    samples,
    fetchedAt: now,
    validAt,
  };
}
/** Bilinear illustration between adjacent samples, never beyond sampled coverage.
 * Dry grid vertices stay dry; missing coverage is distinct from zero rain. */
export function rainAt(
  snapshot: RainSnapshot,
  longitude: number,
  latitude: number,
): { rate: number; elevation: number } | null {
  const b = snapshot.bounds;
  if (
    longitude < b.west ||
    longitude > b.east ||
    latitude < b.south ||
    latitude > b.north
  )
    return null;
  const x = ((longitude - b.west) / (b.east - b.west)) * 4;
  const y = ((latitude - b.south) / (b.north - b.south)) * 3;
  const col = Math.min(3, Math.floor(x)),
    row = Math.min(2, Math.floor(y));
  const dx = x - col,
    dy = y - row;
  const indices = [
    row * 5 + col,
    row * 5 + col + 1,
    (row + 1) * 5 + col,
    (row + 1) * 5 + col + 1,
  ];
  const weights = [(1 - dx) * (1 - dy), dx * (1 - dy), (1 - dx) * dy, dx * dy];
  if (indices.some((i) => !snapshot.samples[i])) return null;
  return indices.reduce(
    (sum, i, n) => ({
      rate: sum.rate + snapshot.samples[i].rate * weights[n],
      elevation: sum.elevation + snapshot.samples[i].elevation * weights[n],
    }),
    { rate: 0, elevation: 0 },
  );
}
export function rainStrength(rate: number) {
  return rate < 0.05 ? 0 : Math.min(1, 0.18 + Math.log1p(rate) / 2.4);
}
