import type { WindForecast, WindPoint } from './wind';

export type StationReading = {
  id: string;
  name: string;
  point: WindPoint;
  observedAt: string;
  rawTime: string;
  timezoneInferred: boolean;
  timezoneNote?: string;
  speed: number;
  direction: number | string | null;
  gust?: number | null;
  originalSpeed: number;
  originalUnits: string;
  directionResolutionDegrees: number;
  positionKind: string;
  positionUncertaintyM: number;
  exposure: string;
  source: {
    name: string;
    url: string;
    capturedAt: string;
    sha256: string;
    reuse: string;
    evidenceUrl: string;
  };
};
export type StationSnapshot = {
  version: 1;
  kind: 'station-snapshot';
  capturedAt: string;
  coverage: WindForecast['coverage'];
  method: string;
  stations: StationReading[];
};
export const STATION_LIMITS = {
  radiusM: 20000,
  nearestM: 10000,
  ageMs: 90 * 60000,
  minimum: 2,
  coherence: 0.35,
};
const rad = Math.PI / 180;
export function stationDistance(a: WindPoint, b: WindPoint) {
  const lat = ((a[1] + b[1]) * rad) / 2;
  return (
    6371000 *
    Math.hypot((a[0] - b[0]) * rad * Math.cos(lat), (a[1] - b[1]) * rad)
  );
}
export function stationRejection(
  s: StationReading,
  reference: number,
): string | null {
  if (
    !Number.isFinite(s.speed) ||
    s.speed < 0 ||
    s.speed > 60 ||
    typeof s.direction !== 'number' ||
    !Number.isFinite(s.direction) ||
    s.direction < 0 ||
    s.direction > 360
  )
    return 'Invalid or variable direction';
  if (
    !Array.isArray(s.point) ||
    s.point.length !== 2 ||
    !s.point.every(Number.isFinite) ||
    Math.abs(s.point[0]) > 180 ||
    Math.abs(s.point[1]) > 85 ||
    !Number.isFinite(s.positionUncertaintyM) ||
    s.positionUncertaintyM < 0
  )
    return 'Invalid position';
  const age = reference - Date.parse(s.observedAt);
  if (!Number.isFinite(age) || age < -5 * 60000)
    return 'Invalid or future timestamp';
  if (age > STATION_LIMITS.ageMs) return 'Too old at capture';
  return null;
}
export function parseStationSnapshot(value: unknown): StationSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const s = value as StationSnapshot,
    c = s.coverage;
  if (
    s.version !== 1 ||
    s.kind !== 'station-snapshot' ||
    !Number.isFinite(Date.parse(s.capturedAt)) ||
    !Array.isArray(s.stations) ||
    s.stations.length > 20 ||
    !s.stations.length ||
    !c ||
    ![c.west, c.east, c.south, c.north].every(Number.isFinite) ||
    c.west >= c.east ||
    c.south >= c.north ||
    c.west < -180 ||
    c.east > 180 ||
    c.south < -85 ||
    c.north > 85
  )
    return null;
  const ids = new Set<string>();
  for (const item of s.stations) {
    if (
      !item ||
      typeof item.id !== 'string' ||
      ids.has(item.id) ||
      typeof item.name !== 'string' ||
      !Array.isArray(item.point) ||
      typeof item.observedAt !== 'string' ||
      typeof item.rawTime !== 'string' ||
      typeof item.positionKind !== 'string' ||
      typeof item.exposure !== 'string' ||
      typeof item.originalUnits !== 'string' ||
      typeof item.source?.reuse !== 'string' ||
      typeof item.source?.name !== 'string' ||
      !/^https:\/\//.test(item.source?.url) ||
      !/^https:\/\//.test(item.source?.evidenceUrl)
    )
      return null;
    ids.add(item.id);
  }
  return s;
}
export type StationEstimate = {
  status: 'estimated' | 'unsupported' | 'variable';
  speed: number;
  from: number;
  coherence: number;
  scalarMean: number;
  contributors: { id: string; weight: number; distanceM: number }[];
};
export function sampleStationWind(
  snapshot: StationSnapshot,
  point: WindPoint,
): StationEstimate {
  const empty = (status: 'unsupported' | 'variable'): StationEstimate => ({
    status,
    speed: 0,
    from: 0,
    coherence: 0,
    scalarMean: 0,
    contributors: [],
  });
  const c = snapshot.coverage;
  if (
    !point.every(Number.isFinite) ||
    point[0] < c.west ||
    point[0] > c.east ||
    point[1] < c.south ||
    point[1] > c.north
  )
    return empty('unsupported');
  const candidates = snapshot.stations.flatMap((s) => {
    if (stationRejection(s, Date.parse(snapshot.capturedAt))) return [];
    const distanceM = stationDistance(s.point, point);
    if (distanceM >= STATION_LIMITS.radiusM) return [];
    // Smooth finite support, softened around uncertain station/proxy locations.
    const taper = (1 - (distanceM / STATION_LIMITS.radiusM) ** 2) ** 2;
    const weight =
      taper / (distanceM ** 2 + Math.max(1000, s.positionUncertaintyM) ** 2);
    return [{ s, distanceM, weight }];
  });
  if (
    candidates.length < STATION_LIMITS.minimum ||
    Math.min(...candidates.map((x) => x.distanceM)) > STATION_LIMITS.nearestM
  )
    return empty('unsupported');
  const total = candidates.reduce((sum, x) => sum + x.weight, 0);
  let east = 0,
    north = 0,
    scalarMean = 0;
  const contributors = candidates.map(({ s, distanceM, weight }) => {
    weight /= total;
    const angle = ((s.direction as number) + 180) * rad;
    east += weight * s.speed * Math.sin(angle);
    north += weight * s.speed * Math.cos(angle);
    scalarMean += weight * s.speed;
    return { id: s.id, weight, distanceM };
  });
  const speed = Math.hypot(east, north),
    coherence = scalarMean > 0.01 ? speed / scalarMean : 1;
  // Opposing observations must never masquerade as a calm forecast.
  const status =
    scalarMean >= 0.5 && coherence < STATION_LIMITS.coherence
      ? 'variable'
      : 'estimated';
  return {
    status,
    speed,
    from: (Math.atan2(east, north) / rad + 540) % 360,
    coherence,
    scalarMean,
    contributors,
  };
}
export function stationSnapshotWind(snapshot: StationSnapshot): WindForecast {
  // Compatibility envelope uses a real reference reading; map and route values
  // always come from sampleStationWind, never these uniform-field properties.
  const reference =
    snapshot.stations.find(
      (s) => !stationRejection(s, Date.parse(snapshot.capturedAt)),
    ) ?? snapshot.stations[0];
  return {
    kind: 'station-snapshot',
    speed: Number.isFinite(reference.speed) ? reference.speed : 0,
    from: typeof reference.direction === 'number' ? reference.direction : 0,
    units: 'm/s',
    validAt: snapshot.capturedAt,
    capturedAt: snapshot.capturedAt,
    coverage: snapshot.coverage,
    stations: snapshot,
  };
}

export function stationTime(value: string) {
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
export function stationSnapshotLabel(snapshot: StationSnapshot) {
  return `Station estimate · ${stationTime(snapshot.capturedAt)} · snapshot, not live`;
}
