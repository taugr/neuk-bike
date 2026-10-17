import type { UnitSystem } from '@/lib/units';
import type { AppLocale } from '@/lib/i18n/locales';
import { formatNumber } from '@/lib/i18n/format';
import {
  sampleProviderWind,
  validProviderGrid,
  PROVIDER_MAX_AGE,
  type ProviderGrid,
} from './provider-wind';
import type {
  CycleRoute,
  CycleRoutePlan,
  CycleRoutesByPlan,
} from './cyclestreets';

/** Adapted from the verified private wind prototype. Uniform area-wide wind,
 * never a street shelter or energy model. Coordinates here are [lng, lat]. */
export type WindPoint = [number, number];
export type WindForecast = {
  kind: 'forecast';
  grid?: ProviderGrid;
  speed: number;
  from: number;
  units: 'm/s';
  validAt: string;
  capturedAt: string;
  coverage: { west: number; east: number; south: number; north: number };
};
export type WindStatus = 'fresh' | 'stale' | 'missing';
export const EDINBURGH_WIND_COVERAGE = {
  west: -3.4,
  east: -3,
  south: 55.88,
  north: 56.02,
};
export const EDINBURGH_WIND_URL =
  'https://api.open-meteo.com/v1/forecast?latitude=55.9533&longitude=-3.1883&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m&wind_speed_unit=ms&timezone=UTC&forecast_days=2&models=ukmo_seamless';

export function parseOpenMeteoWind(
  value: unknown,
  capturedAt: number,
  now = Date.now(),
): WindForecast | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as {
    utc_offset_seconds?: unknown;
    latitude?: unknown;
    longitude?: unknown;
    hourly_units?: { wind_speed_10m?: unknown; wind_direction_10m?: unknown };
    hourly?: {
      time?: unknown;
      wind_speed_10m?: unknown;
      wind_direction_10m?: unknown;
    };
  };
  const h = data.hourly;
  if (
    data.utc_offset_seconds !== 0 ||
    data.hourly_units?.wind_speed_10m !== 'm/s' ||
    data.hourly_units?.wind_direction_10m !== '°' ||
    typeof data.latitude !== 'number' ||
    typeof data.longitude !== 'number' ||
    !Number.isFinite(data.latitude) ||
    !Number.isFinite(data.longitude) ||
    Math.abs(data.latitude - 55.9533) > 0.1 ||
    Math.abs(data.longitude + 3.1883) > 0.1 ||
    !Number.isFinite(capturedAt) ||
    !Array.isArray(h?.time) ||
    !Array.isArray(h.wind_speed_10m) ||
    !Array.isArray(h.wind_direction_10m)
  )
    return null;
  const hour = new Date(now).toISOString().slice(0, 13) + ':00';
  const index = h.time.indexOf(hour);
  if (index < 0) return null;
  return parseWindForecast({
    kind: 'forecast',
    units: 'm/s',
    speed: h.wind_speed_10m[index],
    from: h.wind_direction_10m[index],
    validAt: hour + 'Z',
    capturedAt: new Date(capturedAt).toISOString(),
    coverage: EDINBURGH_WIND_COVERAGE,
  });
}
/** Format the SI speed for display; never convert stored forecast vectors. */
export function formatWindSpeed(
  speed: number,
  units: UnitSystem = 'metric',
  locale: AppLocale = 'en',
) {
  const value = speed * (units === 'imperial' ? 3600 / 1609.344 : 3.6);
  return `${formatNumber(value, locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${units === 'imperial' ? 'mph' : 'km/h'}`;
}

export function formatWindTime(value: string) {
  if (!Number.isFinite(Date.parse(value))) return 'Timestamp unavailable';
  return (
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'UTC',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(value)) + ' UTC'
  );
}

const RAD = Math.PI / 180;
const R = 6371000;
const EPS = 1e-7;
export const WIND_LIMITS = {
  time: 0.2,
  distance: 0.25,
  corridor: 300,
  backtrack: 50,
  endpoints: 35,
  improvement: 0.05,
} as const;

export function parseWindForecast(value: unknown): WindForecast | null {
  if (!value || typeof value !== 'object') return null;
  const w = value as WindForecast;
  const c = w.coverage;
  if (
    w.kind !== 'forecast' ||
    (w.grid &&
      (!validProviderGrid(w.grid) ||
        w.grid.validAt !== w.validAt ||
        w.grid.capturedAt !== w.capturedAt)) ||
    w.units !== 'm/s' ||
    !Number.isFinite(w.speed) ||
    w.speed < 0 ||
    w.speed > 60 ||
    !Number.isFinite(w.from) ||
    !Number.isFinite(Date.parse(w.validAt)) ||
    !Number.isFinite(Date.parse(w.capturedAt)) ||
    !c ||
    ![c.west, c.east, c.south, c.north].every(Number.isFinite) ||
    c.west < -180 ||
    c.east > 180 ||
    c.south < -85 ||
    c.north > 85 ||
    c.west >= c.east ||
    c.south >= c.north
  )
    return null;
  return { ...w, from: ((w.from % 360) + 360) % 360 };
}

export function windStatus(
  wind: WindForecast | null,
  now = Date.now(),
): WindStatus {
  if (!wind || !parseWindForecast(wind)) return 'missing';
  const age = now - Date.parse(wind.capturedAt);
  return age < -300000 ||
    age > (wind.grid ? PROVIDER_MAX_AGE : 24 * 3600000) ||
    Math.abs(now - Date.parse(wind.validAt)) > 3600000
    ? 'stale'
    : 'fresh';
}

export function windCovers(wind: WindForecast, p: WindPoint) {
  const c = wind.coverage;
  return (
    p.every(Number.isFinite) &&
    p[0] >= c.west &&
    p[0] <= c.east &&
    p[1] >= c.south &&
    p[1] <= c.north
  );
}

export function windProjection(
  heading: number,
  wind: Pick<WindForecast, 'speed' | 'from'>,
) {
  return wind.speed * Math.cos((wind.from - heading) * RAD);
}

export function screenBearing(
  a: { x: number; y: number },
  b: { x: number; y: number },
) {
  return Math.hypot(b.x - a.x, b.y - a.y) < EPS
    ? null
    : (Math.atan2(b.x - a.x, a.y - b.y) / RAD + 360) % 360;
}

export function windDestination(
  point: WindPoint,
  wind: Pick<WindForecast, 'speed' | 'from'>,
): WindPoint | null {
  if (wind.speed < 0.5) return null;
  const to = (wind.from + 180) * RAD;
  return [
    point[0] + (Math.sin(to) * 100) / (R * RAD * Math.cos(point[1] * RAD)),
    point[1] + (Math.cos(to) * 100) / (R * RAD),
  ];
}

// One fixed projection for each forecast domain keeps the uniform-field line
// integral independent of point sampling. Only covered geometry is scored.
function displacement(a: WindPoint, b: WindPoint, latitude: number): WindPoint {
  return [
    (b[0] - a[0]) * RAD * R * Math.cos(latitude * RAD),
    (b[1] - a[1]) * RAD * R,
  ];
}
function separation(a: WindPoint, b: WindPoint, latitude: number) {
  return Math.hypot(...displacement(a, b, latitude));
}

export function scoreWindRoute(route: CycleRoute, wind: WindForecast) {
  const points = route.points.map(([lat, lng]): WindPoint => [lng, lat]);
  if (points.length < 2 || !points.every((p) => windCovers(wind, p)))
    return null;
  if (
    wind.grid &&
    points.some((p) => {
      const s = sampleWindAt(wind, p);
      return 'status' in s && s.status !== 'estimated';
    })
  )
    return null;
  const latitude = (wind.coverage.north + wind.coverage.south) / 2;
  const start = points[0]!,
    end = points.at(-1)!;
  const [ex, ey] = displacement(start, end, latitude);
  const direct = Math.hypot(ex, ey);
  if (direct < 1) return null;
  let distance = 0,
    burden = 0,
    headIntegral = 0,
    backtrack = 0,
    corridor = 0;
  for (let i = 1; i < points.length; i++) {
    const [dx, dy] = displacement(points[i - 1]!, points[i]!, latitude);
    const length = Math.hypot(dx, dy);
    if (length < EPS) continue;
    const pieces = wind.grid ? Math.max(1, Math.ceil(length / 100)) : 1;
    for (let part = 0; part < pieces; part++) {
      const t = (part + 0.5) / pieces;
      const p: WindPoint = [
        points[i - 1][0] + (points[i][0] - points[i - 1][0]) * t,
        points[i - 1][1] + (points[i][1] - points[i - 1][1]) * t,
      ];
      const sample = sampleWindAt(wind, p);
      if ('status' in sample && sample.status !== 'estimated') return null;
      const headwind = Math.max(
        0,
        windProjection(Math.atan2(dx, dy) / RAD, sample),
      );
      burden += (length / pieces / 1000) * headwind ** 2;
      headIntegral += (length / pieces) * headwind;
    }
    distance += length;
    backtrack += Math.max(0, -(dx * ex + dy * ey) / direct);
    const [px, py] = displacement(start, points[i]!, latitude);
    const t = Math.min(1, Math.max(0, (px * ex + py * ey) / direct ** 2));
    corridor = Math.max(corridor, Math.hypot(px - t * ex, py - t * ey));
  }
  if (!distance) return null;
  return {
    burden,
    meanHeadwind: headIntegral / distance,
    distance,
    backtrack,
    corridor,
    start,
    end,
    latitude,
  };
}

export type WindComparison = {
  plan: CycleRoutePlan;
  reason:
    | 'improved'
    | 'calm'
    | 'no-improvement'
    | 'unavailable'
    | 'outside'
    | 'stale'
    | 'missing'
    | 'uncertain';
  extraSeconds: number;
  extraMeters: number;
};

export function compareWindRoutes(
  routes: CycleRoutesByPlan,
  baselinePlan: CycleRoutePlan,
  wind: WindForecast | null,
  now = Date.now(),
): WindComparison {
  const unchanged = (reason: WindComparison['reason']): WindComparison => ({
    plan: baselinePlan,
    reason,
    extraSeconds: 0,
    extraMeters: 0,
  });
  const status = windStatus(wind, now);
  if (!wind || status === 'missing' || status === 'stale')
    return unchanged(status === 'stale' ? 'stale' : 'missing');
  const baseline = routes[baselinePlan];
  if (!baseline) return unchanged('unavailable');
  const score = scoreWindRoute(baseline, wind);
  if (!score) return unchanged(wind.grid ? 'uncertain' : 'outside');
  const valid = (route: CycleRoute, distance: number) =>
    route.source === 'cyclestreets' &&
    !route.segments &&
    Number.isFinite(route.durationSeconds) &&
    route.durationSeconds > 0 &&
    Number.isFinite(route.distanceMeters) &&
    route.distanceMeters > 0 &&
    Math.abs(distance / route.distanceMeters - 1) <= 0.15;
  if (!valid(baseline, score.distance)) return unchanged('unavailable');
  if ((!wind.grid && wind.speed < 0.5) || score.meanHeadwind < 0.5)
    return unchanged('calm');
  // Preserve the selected cycling safety preference: never trade a quieter
  // provider profile for a faster profile in pursuit of wind score alone.
  const quietness = { quietest: 2, balanced: 1, fastest: 0 };
  let best = baseline,
    bestBurden = score.burden,
    alternatives = 0;
  for (const route of Object.values(routes)) {
    if (route === baseline || quietness[route.plan] < quietness[baselinePlan])
      continue;
    const candidate = scoreWindRoute(route, wind);
    if (
      !candidate ||
      !valid(route, candidate.distance) ||
      separation(score.start, candidate.start, score.latitude) >
        WIND_LIMITS.endpoints ||
      separation(score.end, candidate.end, score.latitude) >
        WIND_LIMITS.endpoints
    )
      continue;
    alternatives++;
    if (
      route.durationSeconds >
        baseline.durationSeconds * (1 + WIND_LIMITS.time) + EPS ||
      route.distanceMeters >
        baseline.distanceMeters * (1 + WIND_LIMITS.distance) + EPS ||
      candidate.corridor > score.corridor + WIND_LIMITS.corridor + EPS ||
      candidate.backtrack > score.backtrack + WIND_LIMITS.backtrack + EPS
    )
      continue;
    if (
      candidate.burden < bestBurden - EPS &&
      score.burden > EPS &&
      1 - candidate.burden / score.burden >= WIND_LIMITS.improvement
    ) {
      best = route;
      bestBurden = candidate.burden;
    }
  }
  if (best === baseline)
    return unchanged(alternatives ? 'no-improvement' : 'unavailable');
  return {
    plan: best.plan,
    reason: 'improved',
    extraSeconds: best.durationSeconds - baseline.durationSeconds,
    extraMeters: best.distanceMeters - baseline.distanceMeters,
  };
}

/** The map and route scorer deliberately share the same signed field sampler. */
export function sampleWindAt(wind: WindForecast, point: WindPoint) {
  return wind.grid ? sampleProviderWind(wind.grid, point) : wind;
}
