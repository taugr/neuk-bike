import type { WindForecast, WindPoint } from './wind';

export const PROVIDER_MODEL = 'ukmo_uk_deterministic_2km';
export const PROVIDER_ROWS = [55.9, 55.94, 55.98, 56.02];
export const PROVIDER_COLUMNS = [-3.36, -3.28, -3.2, -3.12, -3.04];
export const PROVIDER_POINTS: WindPoint[] = PROVIDER_ROWS.flatMap((lat) =>
  PROVIDER_COLUMNS.map((lng) => [lng, lat] as WindPoint),
);
export const PROVIDER_MAX_AGE = 2 * 3600000;
export const PROVIDER_REFRESH = 30 * 60000;
export const PROVIDER_GRID_URL =
  'https://api.open-meteo.com/v1/forecast?' +
  new URLSearchParams({
    latitude: PROVIDER_POINTS.map((p) => p[1]).join(','),
    longitude: PROVIDER_POINTS.map((p) => p[0]).join(','),
    elevation: PROVIDER_POINTS.map(() => 'nan').join(','),
    hourly: 'wind_speed_10m,wind_direction_10m',
    wind_speed_unit: 'ms',
    timezone: 'UTC',
    forecast_days: '2',
    models: PROVIDER_MODEL,
    cell_selection: 'nearest',
  }).toString();
export type ProviderCell = {
  requested: WindPoint;
  point: WindPoint;
  speed: number;
  from: number;
};
export type ProviderGrid = {
  model: typeof PROVIDER_MODEL | 'best_match';
  resolutionM: number | null;
  sourceUrl: string;
  validAt: string;
  capturedAt: string;
  cells: ProviderCell[];
  triangles?: [number, number, number][];
};
export type FieldSample = {
  status: 'estimated' | 'unsupported' | 'variable';
  speed: number;
  from: number;
};
const rad = Math.PI / 180;
export function validProviderGrid(grid: ProviderGrid) {
  if (grid?.model === 'best_match') return validRegionalGrid(grid);
  if (
    !grid ||
    grid.model !== PROVIDER_MODEL ||
    grid.resolutionM !== 2000 ||
    grid.sourceUrl !== PROVIDER_GRID_URL ||
    !Number.isFinite(Date.parse(grid.validAt)) ||
    !Number.isFinite(Date.parse(grid.capturedAt)) ||
    !Array.isArray(grid.cells) ||
    grid.cells.length !== PROVIDER_POINTS.length
  )
    return false;
  const ids = new Set<string>();
  for (let i = 0; i < grid.cells.length; i++) {
    const c = grid.cells[i],
      requested = PROVIDER_POINTS[i];
    if (
      !c ||
      !Array.isArray(c.point) ||
      c.point.length !== 2 ||
      !c.point.every(Number.isFinite) ||
      !Array.isArray(c.requested) ||
      c.requested[0] !== requested[0] ||
      c.requested[1] !== requested[1] ||
      !Number.isFinite(c.speed) ||
      c.speed < 0 ||
      c.speed > 60 ||
      !Number.isFinite(c.from) ||
      c.from < 0 ||
      c.from > 360
    )
      return false;
    const d =
      111195 *
      Math.hypot(
        (c.point[0] - requested[0]) * Math.cos(requested[1] * rad),
        c.point[1] - requested[1],
      );
    if (d > 2500) return false;
    const id = c.point.join(':');
    if (ids.has(id)) return false;
    ids.add(id);
    if (i % 5 && c.point[0] <= grid.cells[i - 1].point[0]) return false;
    if (i >= 5 && c.point[1] <= grid.cells[i - 5].point[1]) return false;
  }
  // Reject folded or degenerate mesh cells before Newton inversion.
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 4; col++) {
      const [a, b, c, d] = [
        grid.cells[row * 5 + col],
        grid.cells[row * 5 + col + 1],
        grid.cells[(row + 1) * 5 + col],
        grid.cells[(row + 1) * 5 + col + 1],
      ].map((cell) => cell.point);
      for (const u of [0, 1])
        for (const v of [0, 1]) {
          const du = [
            (b[0] - a[0]) * (1 - v) + (d[0] - c[0]) * v,
            (b[1] - a[1]) * (1 - v) + (d[1] - c[1]) * v,
          ];
          const dv = [
            (c[0] - a[0]) * (1 - u) + (d[0] - b[0]) * u,
            (c[1] - a[1]) * (1 - u) + (d[1] - b[1]) * u,
          ];
          if (du[0] * dv[1] - du[1] * dv[0] <= 1e-8) return false;
        }
    }
  return true;
}

/** Explicit UKV request; API returned coordinates are the actual selected cells.
 * No downscaling, no invented observations, no independent per-point hour choice. */
export function parseProviderWind(
  value: unknown,
  capturedAt: number,
  now = Date.now(),
): WindForecast | null {
  if (
    !Array.isArray(value) ||
    value.length !== PROVIDER_POINTS.length ||
    !Number.isFinite(capturedAt) ||
    !Number.isFinite(now)
  )
    return null;
  const hour = new Date(now).toISOString().slice(0, 13) + ':00';
  const cells: ProviderCell[] = [];
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
    cells.push({
      requested: PROVIDER_POINTS[i],
      point: [v.longitude, v.latitude],
      speed: h.wind_speed_10m[index],
      from: h.wind_direction_10m[index],
    });
  }
  const grid: ProviderGrid = {
    model: PROVIDER_MODEL,
    resolutionM: 2000,
    sourceUrl: PROVIDER_GRID_URL,
    capturedAt: new Date(capturedAt).toISOString(),
    validAt: hour + 'Z',
    cells,
  };
  if (!validProviderGrid(grid)) return null;
  const centre = sampleProviderWind(grid, [-3.1883, 55.9533]);
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

/** Invert each returned geographic quadrilateral, then bilinearly interpolate
 * signed east/north airflow. Adjacent cells share edges, so values are continuous.
 * Supports only the returned mesh; never extrapolates beyond its boundary. */
export function sampleProviderWind(
  grid: ProviderGrid,
  p: WindPoint,
): FieldSample {
  const unsupported: FieldSample = { status: 'unsupported', speed: 0, from: 0 };
  if (!p.every(Number.isFinite)) return unsupported;
  if (grid.model === 'best_match') {
    for (const indices of grid.triangles ?? []) {
      const nodes = indices.map((i) => grid.cells[i]);
      const [a, b, c] = nodes.map((n) => n.point);
      const det = cross(a, b, c);
      const v = cross(a, p, c) / det;
      const w = cross(a, b, p) / det;
      const u = 1 - v - w;
      if (Math.min(u, v, w) >= -1e-9)
        return blendWind(
          nodes,
          [u, v, w].map((x) => Math.max(0, x)),
        );
    }
    return unsupported;
  }
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 4; col++) {
      const a = grid.cells[row * 5 + col],
        b = grid.cells[row * 5 + col + 1],
        c = grid.cells[(row + 1) * 5 + col],
        d = grid.cells[(row + 1) * 5 + col + 1];
      const nodes = [a, b, c, d];
      if (
        p[0] < Math.min(...nodes.map((n) => n.point[0])) - 1e-9 ||
        p[0] > Math.max(...nodes.map((n) => n.point[0])) + 1e-9 ||
        p[1] < Math.min(...nodes.map((n) => n.point[1])) - 1e-9 ||
        p[1] > Math.max(...nodes.map((n) => n.point[1])) + 1e-9
      )
        continue;
      let u = 0.5,
        v = 0.5;
      for (let iteration = 0; iteration < 8; iteration++) {
        const weights = [(1 - u) * (1 - v), u * (1 - v), (1 - u) * v, u * v];
        const x =
          nodes.reduce((sum, n, i) => sum + weights[i] * n.point[0], 0) - p[0];
        const y =
          nodes.reduce((sum, n, i) => sum + weights[i] * n.point[1], 0) - p[1];
        const du = [
          (b.point[0] - a.point[0]) * (1 - v) + (d.point[0] - c.point[0]) * v,
          (b.point[1] - a.point[1]) * (1 - v) + (d.point[1] - c.point[1]) * v,
        ];
        const dv = [
          (c.point[0] - a.point[0]) * (1 - u) + (d.point[0] - b.point[0]) * u,
          (c.point[1] - a.point[1]) * (1 - u) + (d.point[1] - b.point[1]) * u,
        ];
        const det = du[0] * dv[1] - du[1] * dv[0];
        if (Math.abs(det) < 1e-12) break;
        u -= (x * dv[1] - y * dv[0]) / det;
        v -= (y * du[0] - x * du[1]) / det;
      }
      if (
        !Number.isFinite(u + v) ||
        u < -1e-7 ||
        u > 1 + 1e-7 ||
        v < -1e-7 ||
        v > 1 + 1e-7
      )
        continue;
      u = Math.max(0, Math.min(1, u));
      v = Math.max(0, Math.min(1, v));
      const weights = [(1 - u) * (1 - v), u * (1 - v), (1 - u) * v, u * v];
      let east = 0,
        north = 0,
        scalar = 0;
      nodes.forEach((n, i) => {
        const angle = (n.from + 180) * rad;
        east += weights[i] * n.speed * Math.sin(angle);
        north += weights[i] * n.speed * Math.cos(angle);
        scalar += weights[i] * n.speed;
      });
      const speed = Math.hypot(east, north);
      return {
        status:
          scalar >= 0.5 && speed / scalar < 0.35 ? 'variable' : 'estimated',
        speed,
        from: (Math.atan2(east, north) / rad + 540) % 360,
      };
    }
  return unsupported;
}

export function cross(a: WindPoint, b: WindPoint, c: WindPoint) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function blendWind(nodes: ProviderCell[], weights: number[]): FieldSample {
  let east = 0,
    north = 0,
    scalar = 0;
  nodes.forEach((n, i) => {
    const angle = (n.from + 180) * rad;
    east += weights[i] * n.speed * Math.sin(angle);
    north += weights[i] * n.speed * Math.cos(angle);
    scalar += weights[i] * n.speed;
  });
  const speed = Math.hypot(east, north);
  return {
    status: scalar >= 0.5 && speed / scalar < 0.35 ? 'variable' : 'estimated',
    speed,
    from: (Math.atan2(east, north) / rad + 540) % 360,
  };
}

function validRegionalGrid(grid: ProviderGrid) {
  if (
    grid.resolutionM !== null ||
    !Number.isFinite(Date.parse(grid.validAt)) ||
    !Number.isFinite(Date.parse(grid.capturedAt)) ||
    !grid.sourceUrl.startsWith('https://api.open-meteo.com/v1/forecast?') ||
    !Array.isArray(grid.cells) ||
    grid.cells.length < 3 ||
    grid.cells.length > 20 ||
    !Array.isArray(grid.triangles) ||
    !grid.triangles.length ||
    grid.triangles.length > 24
  )
    return false;
  const ids = new Set<string>();
  for (const cell of grid.cells) {
    if (
      !cell ||
      !Array.isArray(cell.point) ||
      cell.point.length !== 2 ||
      !cell.point.every(Number.isFinite) ||
      Math.abs(cell.point[0]) > 180 ||
      Math.abs(cell.point[1]) > 85 ||
      !Array.isArray(cell.requested) ||
      cell.requested.length !== 2 ||
      !cell.requested.every(Number.isFinite) ||
      Math.abs(cell.point[0] - cell.requested[0]) > 0.5 ||
      Math.abs(cell.point[1] - cell.requested[1]) > 0.5 ||
      !Number.isFinite(cell.speed) ||
      cell.speed < 0 ||
      cell.speed > 60 ||
      !Number.isFinite(cell.from) ||
      cell.from < 0 ||
      cell.from > 360 ||
      ids.has(cell.point.join(':'))
    )
      return false;
    ids.add(cell.point.join(':'));
  }
  return grid.triangles.every(
    (t) =>
      Array.isArray(t) &&
      t.length === 3 &&
      t.every((i) => Number.isInteger(i) && i >= 0 && i < grid.cells.length) &&
      cross(
        grid.cells[t[0]].point,
        grid.cells[t[1]].point,
        grid.cells[t[2]].point,
      ) > 1e-8,
  );
}
