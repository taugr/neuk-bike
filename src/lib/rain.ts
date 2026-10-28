import type { ParkingMapBounds } from './map-pins';
import { weatherBoundsOverlap, weatherGridBounds } from './weather-grid';

export const rainStorageKey = 'bike-neuk-map-rain';
export const RAIN_REFRESH = 15 * 60000;
export const RAIN_MAX_AGE = 30 * 60000;
export type RainPoint = {
  longitude: number;
  latitude: number;
  rate: number;
  /** Snow depth accumulation in cm/hour, kept separate from liquid mm/hour. */
  snowRate: number;
  weatherCode: number;
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
  const area = weatherGridBounds(bounds);
  if (!area) return null;
  const points: [number, number][] = Array.from({ length: 20 }, (_, i) => [
    Number((area.west + ((i % 5) * (area.east - area.west)) / 4).toFixed(5)),
    Number(
      (
        area.south +
        (Math.floor(i / 5) * (area.north - area.south)) / 3
      ).toFixed(5),
    ),
  ]);
  const query = new URLSearchParams({
    latitude: points.map((p) => p[1]).join(','),
    longitude: points.map((p) => p[0]).join(','),
    current: 'rain,showers,snowfall,weather_code',
    timeformat: 'unixtime',
    models: 'best_match',
    cell_selection: 'nearest',
    precipitation_unit: 'mm',
  });
  return {
    key: `weather-v3:${area.west}:${area.south}:${area.east}:${area.north}`,
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
/** Keep known rain while an overlapping viewport loads; never extend coverage. */
export function rainOverlaps(snapshot: RainSnapshot, bounds: ParkingMapBounds) {
  return weatherBoundsOverlap(snapshot.bounds, bounds);
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
      units?.snowfall !== 'cm' ||
      units?.weather_code !== 'wmo code' ||
      units?.time !== 'unixtime' ||
      units?.interval !== 'seconds' ||
      ![
        c.time,
        c.interval,
        c.rain,
        c.showers,
        c.snowfall,
        c.weather_code,
        row.longitude,
        row.latitude,
        row.elevation,
      ].every((v) => typeof v === 'number' && Number.isFinite(v)) ||
      c.interval <= 0 ||
      c.interval > 3600 ||
      c.rain < 0 ||
      c.showers < 0 ||
      c.snowfall < 0 ||
      !weatherCodes.has(c.weather_code) ||
      Math.abs(row.longitude - region.points[i][0]) > 0.5 ||
      Math.abs(row.latitude - region.points[i][1]) > 0.5 ||
      c.time * 1000 > now + 5 * 60000 ||
      now - c.time * 1000 >= RAIN_MAX_AGE
    )
      return null;
    validAt = Math.min(validAt, c.time * 1000);
    // Separate liquid and snow accumulations; normalize both by the actual interval.
    const rate = ((c.rain + c.showers) * 3600) / c.interval;
    const snowRate = (c.snowfall * 3600) / c.interval;
    if (
      !Number.isFinite(rate) ||
      rate > 500 ||
      !Number.isFinite(snowRate) ||
      snowRate > 100
    )
      return null;
    samples.push({
      longitude: region.points[i][0],
      latitude: region.points[i][1],
      elevation: row.elevation,
      rate,
      snowRate,
      weatherCode: c.weather_code,
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
): Pick<RainPoint, 'rate' | 'snowRate' | 'weatherCode' | 'elevation'> | null {
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
  const amounts = indices.reduce(
    (sum, i, n) => ({
      rate: sum.rate + snapshot.samples[i].rate * weights[n],
      snowRate: sum.snowRate + snapshot.samples[i].snowRate * weights[n],
      elevation: sum.elevation + snapshot.samples[i].elevation * weights[n],
    }),
    { rate: 0, snowRate: 0, elevation: 0 },
  );
  // Weather codes are categories: never interpolate their numeric values or
  // spread a thunderstorm flag across the entire surrounding grid cell.
  const nearest = (row + (dy >= 0.5 ? 1 : 0)) * 5 + col + (dx >= 0.5 ? 1 : 0);
  return { ...amounts, weatherCode: snapshot.samples[nearest].weatherCode };
}
export function rainStrength(rate: number) {
  return rate < 0.05 ? 0 : Math.min(1, 0.18 + Math.log1p(rate) / 2.4);
}

// Open-Meteo WMO conditions, including heavy thunderstorms (97).
const weatherCodes = new Set([
  0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77,
  80, 81, 82, 85, 86, 95, 96, 97, 99,
]);
export const isThunderstorm = (code: number) => [95, 96, 97, 99].includes(code);
export const isHail = (code: number) => code === 96 || code === 99;
export const isFog = (code: number) => code === 45 || code === 48;
export const isFreezing = (code: number) => [56, 57, 66, 67].includes(code);

export type WeatherCondition =
  | 'dry'
  | 'fog'
  | 'drizzle'
  | 'lightRain'
  | 'rain'
  | 'heavyRain'
  | 'snow'
  | 'heavySnow'
  | 'sleet'
  | 'freezingRain'
  | 'thunderstorm'
  | 'hail';
type Conditions = Pick<RainPoint, 'rate' | 'snowRate' | 'weatherCode'>;
export function weatherCondition({
  rate,
  snowRate,
  weatherCode,
}: Conditions): WeatherCondition {
  if (isHail(weatherCode)) return 'hail';
  if (isThunderstorm(weatherCode)) return 'thunderstorm';
  if (snowRate >= 0.01 && rate >= 0.05) return 'sleet';
  if (snowRate >= 0.01) return snowRate >= 1 ? 'heavySnow' : 'snow';
  if (rate < 0.05) return isFog(weatherCode) ? 'fog' : 'dry';
  if (isFreezing(weatherCode)) return 'freezingRain';
  if ([51, 53, 55].includes(weatherCode) || rate < 0.5) return 'drizzle';
  return rate < 2.5 ? 'lightRain' : rate < 7.5 ? 'rain' : 'heavyRain';
}

/** Describe the visible area; do not report a storm only present in the padded grid. */
export function weatherSummary(
  snapshot: RainSnapshot,
  bounds: ParkingMapBounds | null,
): WeatherCondition {
  const samples = bounds
    ? snapshot.samples.filter(
        (p) =>
          p.longitude >= bounds.west &&
          p.longitude <= bounds.east &&
          p.latitude >= bounds.south &&
          p.latitude <= bounds.north,
      )
    : snapshot.samples;
  const centre = bounds
    ? rainAt(
        snapshot,
        (bounds.west + bounds.east) / 2,
        (bounds.south + bounds.north) / 2,
      )
    : null;
  const visible = samples.length ? samples : centre ? [centre] : [];
  const kinds = visible.map(weatherCondition);
  for (const kind of ['hail', 'thunderstorm', 'freezingRain'] as const)
    if (kinds.includes(kind)) return kind;
  if (
    visible.some((p) => p.rate >= 0.05) &&
    visible.some((p) => p.snowRate >= 0.01)
  )
    return 'sleet';
  for (const kind of [
    'heavySnow',
    'snow',
    'heavyRain',
    'rain',
    'lightRain',
    'drizzle',
    'fog',
  ] as const)
    if (kinds.includes(kind)) return kind;
  return 'dry';
}
