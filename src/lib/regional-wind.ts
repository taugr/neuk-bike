import type { ParkingMapBounds } from './map-pins';
import type { WindForecast, WindPoint } from './wind';
import {
  cross,
  sampleProviderWind,
  validProviderGrid,
  type ProviderCell,
  type ProviderGrid,
} from './provider-wind';

export type WindRegion = {
  key: string;
  points: WindPoint[];
  bounds: ParkingMapBounds;
  url: string;
};
const rounded = (n: number) => Math.round(n * 1e6) / 1e6;

/** Quantized public map grid, never exact GPS, stops or route coordinates.
 * One 20-location request; at most a two-degree region, including padding. */
export function windRegion(bounds: ParkingMapBounds): WindRegion | null {
  const { west, east, south, north } = bounds;
  if (
    ![west, east, south, north].every(Number.isFinite) ||
    west >= east ||
    south >= north ||
    west < -180 ||
    east > 180 ||
    south < -80 ||
    north > 80 ||
    east - west > 1.5 ||
    north - south > 1.5
  )
    return null;
  const span = Math.max(east - west, north - south) > 0.5 ? 2 : 1;
  const lng = Math.floor((west + east) / 2 / 0.5) * 0.5 + 0.25;
  const lat = Math.floor((south + north) / 2 / 0.5) * 0.5 + 0.25;
  const area = {
    west: lng - span / 2,
    east: lng + span / 2,
    south: lat - span / 2,
    north: lat + span / 2,
  };
  const points: WindPoint[] = Array.from({ length: 20 }, (_, i) => [
    rounded(area.west + ((i % 5) * span) / 4),
    rounded(area.south + (Math.floor(i / 5) * span) / 3),
  ]);
  const query = new URLSearchParams({
    latitude: points.map((p) => p[1]).join(','),
    longitude: points.map((p) => p[0]).join(','),
    elevation: points.map(() => 'nan').join(','),
    hourly: 'wind_speed_10m,wind_direction_10m',
    wind_speed_unit: 'ms',
    timezone: 'UTC',
    forecast_days: '1',
    models: 'best_match',
    cell_selection: 'nearest',
  });
  return {
    key: `best-match-v1:${lng}:${lat}:${span}`,
    points,
    bounds: area,
    url: 'https://api.open-meteo.com/v1/forecast?' + query.toString(),
  };
}

/** Deduplicate actual cells. Triangulate only neighbouring requested quads,
 * dropping folded/degenerate areas rather than bridging unsupported holes. */
export function parseRegionalWind(
  value: unknown,
  region: WindRegion,
  capturedAt: number,
  now = Date.now(),
): WindForecast | null {
  if (
    !Array.isArray(value) ||
    value.length !== 20 ||
    !Number.isFinite(capturedAt) ||
    !Number.isFinite(now)
  )
    return null;
  const hour = new Date(now).toISOString().slice(0, 13) + ':00';
  const cells: ProviderCell[] = [],
    indices: number[] = [],
    ids = new Map<string, number>();
  for (let i = 0; i < value.length; i++) {
    const v = value[i],
      h = v?.hourly;
    if (
      v?.utc_offset_seconds !== 0 ||
      v.hourly_units?.wind_speed_10m !== 'm/s' ||
      v.hourly_units?.wind_direction_10m !== '°' ||
      !Array.isArray(h?.time) ||
      !Array.isArray(h.wind_speed_10m) ||
      !Array.isArray(h.wind_direction_10m)
    )
      return null;
    const index = h.time.indexOf(hour);
    if (index < 0 || h.time.lastIndexOf(hour) !== index) return null;
    const cell: ProviderCell = {
      requested: region.points[i],
      point: [v.longitude, v.latitude],
      speed: h.wind_speed_10m[index],
      from: h.wind_direction_10m[index],
    };
    if (
      !cell.point.every(Number.isFinite) ||
      Math.abs(cell.point[0] - cell.requested[0]) > 0.5 ||
      Math.abs(cell.point[1] - cell.requested[1]) > 0.5
    )
      return null;
    const id = cell.point.join(':'),
      existing = ids.get(id);
    if (existing !== undefined) {
      if (
        cells[existing].speed !== cell.speed ||
        cells[existing].from !== cell.from
      )
        return null;
      indices.push(existing);
    } else {
      ids.set(id, cells.length);
      indices.push(cells.length);
      cells.push(cell);
    }
  }
  const triangles: [number, number, number][] = [],
    seen = new Set<string>();
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 4; col++) {
      const quad = [
        indices[row * 5 + col],
        indices[row * 5 + col + 1],
        indices[(row + 1) * 5 + col + 1],
        indices[(row + 1) * 5 + col],
      ];
      const polygon = [...new Set(quad)];
      if (
        polygon.length < 3 ||
        polygon.some(
          (_, i) =>
            cross(
              cells[polygon[i]].point,
              cells[polygon[(i + 1) % polygon.length]].point,
              cells[polygon[(i + 2) % polygon.length]].point,
            ) < -1e-8,
        )
      )
        continue;
      for (let i = 1; i < polygon.length - 1; i++) {
        const t: [number, number, number] = [
            polygon[0],
            polygon[i],
            polygon[i + 1],
          ],
          id = [...t].sort().join(':');
        if (
          cross(
            ...(t.map((n) => cells[n].point) as [
              WindPoint,
              WindPoint,
              WindPoint,
            ]),
          ) > 1e-8 &&
          !seen.has(id)
        ) {
          triangles.push(t);
          seen.add(id);
        }
      }
    }
  const grid: ProviderGrid = {
    model: 'best_match',
    resolutionM: null,
    sourceUrl: region.url,
    capturedAt: new Date(capturedAt).toISOString(),
    validAt: hour + 'Z',
    cells,
    triangles,
  };
  if (!validProviderGrid(grid)) return null;
  const centre = sampleProviderWind(grid, [
    (region.bounds.west + region.bounds.east) / 2,
    (region.bounds.south + region.bounds.north) / 2,
  ]);
  return {
    kind: 'forecast',
    units: 'm/s',
    speed: centre.speed,
    from: centre.from,
    validAt: grid.validAt,
    capturedAt: grid.capturedAt,
    grid,
    coverage: {
      west: Math.min(...cells.map((c) => c.point[0])),
      east: Math.max(...cells.map((c) => c.point[0])),
      south: Math.min(...cells.map((c) => c.point[1])),
      north: Math.max(...cells.map((c) => c.point[1])),
    },
  };
}

/** Budget counts locations conservatively, including failed/aborted requests.
 * Limits are per tab, below hosted limits; not a production-wide quota solution. */
export function reserveWindRequest(history: number[], now: number) {
  const recent = history.filter((t) => now - t >= 0 && now - t < 86400000);
  const minute = recent.filter((t) => now - t < 60000),
    hour = recent.filter((t) => now - t < 3600000);
  const latest = recent.at(-1);
  const wait = Math.max(
    0,
    latest === undefined ? 0 : latest + 10000 - now,
    minute.length >= 10 ? minute[0] + 60000 - now : 0,
    hour.length >= 50 ? hour[0] + 3600000 - now : 0,
    recent.length >= 250 ? recent[0] + 86400000 - now : 0,
  );
  return { history: wait ? recent : [...recent, now], wait };
}

export function windRequestBounds(
  view: ParkingMapBounds,
  routes: WindPoint[][] = [],
): ParkingMapBounds {
  const points = routes.flat();
  if (points.length < 2) return view;
  const west = Math.min(...points.map((p) => p[0])),
    east = Math.max(...points.map((p) => p[0]));
  const south = Math.min(...points.map((p) => p[1])),
    north = Math.max(...points.map((p) => p[1]));
  // Long journeys keep the local map field; complete coverage remains required for scoring.
  return east - west > 1.5 || north - south > 1.5
    ? view
    : {
        west: west - 0.01,
        east: east + 0.01,
        south: south - 0.01,
        north: north + 0.01,
      };
}

/** Retain the verified fine UKV Edinburgh experiment where it covers the journey.
 * All other areas use best_match; no single-Edinburgh fallback crosses regions. */
export function useEdinburghGrid(
  bounds: ParkingMapBounds,
  routeBounds = false,
) {
  const lng = (bounds.west + bounds.east) / 2,
    lat = (bounds.south + bounds.north) / 2;
  return (
    bounds.east - bounds.west < 0.5 &&
    bounds.north - bounds.south < 0.5 &&
    (routeBounds
      ? bounds.west >= -3.36 &&
        bounds.east <= -3.05 &&
        bounds.south >= 55.91 &&
        bounds.north <= 56.01
      : lng >= -3.36 && lng <= -3.05 && lat >= 55.91 && lat <= 56.01)
  );
}
