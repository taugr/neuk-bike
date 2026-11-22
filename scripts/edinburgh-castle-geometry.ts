import { MercatorCoordinate, type GeoJSONFeature } from 'maplibre-gl';
import source from './data/edinburgh-castle.json';
import { appendGatehouse } from './edinburgh-castle-gatehouse';
import { edinburghMeshZoom } from '../src/lib/edinburgh-mesh';
import { roofContainsPoint } from '../src/lib/waverley-roof-profile';
import {
  roofTileExtent,
  wallOriginTile,
} from '../src/lib/map-aerial-roof-geometry';

export type Point = readonly [x: number, y: number, z: number];
type LngLat = [number, number];
export type Stone =
  | 'rubble'
  | 'sandstone'
  | 'dressing'
  | 'slate'
  | 'shadow'
  | 'bronze'
  | 'paving';
export type AddFace = (
  points:
    | readonly [Point, Point, Point]
    | readonly [Point, Point, Point, Point],
  material: Stone,
) => void;
const materials: Stone[] = [
  'rubble',
  'sandstone',
  'dressing',
  'slate',
  'shadow',
  'bronze',
  'paving',
];
const origin = MercatorCoordinate.fromLngLat([-3.2005, 55.94865]);
const metre = origin.meterInMercatorCoordinateUnits();
const scale = 2 ** wallOriginTile.z * roofTileExtent;
const gateOutline = source.gatehouse.outline.map(([x, y]) => ({ x, y }));

function local(location: LngLat) {
  const p = MercatorCoordinate.fromLngLat(location);
  return { x: (p.x - origin.x) / metre, y: (origin.y - p.y) / metre };
}

export function isCastleGatehouse(geometry: GeoJSONFeature['geometry']) {
  if (geometry.type !== 'Polygon') return false;
  const ring = geometry.coordinates[0] as number[][];
  if (
    !ring?.length ||
    !ring.every(
      ([x, y]) => x > -3.19881 && x < -3.19854 && y > 55.94835 && y < 55.9487,
    )
  )
    return false;
  // The footprint and its OSM building parts overlap the authored model.
  // Keep the adjoining structures outside the mapped Gatehouse outline.
  const center = ring.reduce(
    ({ x, y }, p) => ({
      x: x + p[0] / ring.length,
      y: y + p[1] / ring.length,
    }),
    { x: 0, y: 0 },
  );
  return roofContainsPoint([gateOutline], center);
}

function appendCurtain(
  add: AddFace,
  { name, points, slots, thickness }: (typeof source.walls)[number],
) {
  const path = points.map(([lon, lat, top, bottom]) => ({
    ...local([lon, lat]),
    top,
    bottom,
  }));
  function direction(a: (typeof path)[number], b: (typeof path)[number]) {
    const x = b.x - a.x;
    const y = b.y - a.y;
    const length = Math.hypot(x, y) || 1;
    return { nx: -y / length, ny: x / length };
  }
  const sections = path.map((p, i) => {
    const last = path.length - 1;
    const before = direction(path[Math.max(0, i - 1)], path[Math.max(1, i)]);
    const after = direction(
      path[Math.min(last - 1, i)],
      path[Math.min(last, i + 1)],
    );
    const dot = before.nx * after.nx + before.ny * after.ny;
    const denominator = Math.max(1.1, 1 + dot);
    return {
      ...p,
      nx: (before.nx + after.nx) / denominator,
      ny: (before.ny + after.ny) / denominator,
    };
  });
  const stations = [0];
  for (let i = 1; i < sections.length; i++)
    stations.push(
      stations[i - 1] +
        Math.hypot(
          sections[i].x - sections[i - 1].x,
          sections[i].y - sections[i - 1].y,
        ),
    );
  const length = stations.at(-1)!;
  const holes = Array.from({ length: slots }, (_, i) => {
    const center = ((i + 0.5) * length) / slots;
    return [center - 0.56, center + 0.56] as const;
  });
  const cuts = [...new Set([...stations, ...holes.flat()])].sort(
    (a, b) => a - b,
  );
  const at = (position: number) => {
    const i = Math.max(
      1,
      stations.findIndex((s) => s >= position),
    );
    const a = sections[i - 1];
    const b = sections[i];
    const fraction =
      (position - stations[i - 1]) / (stations[i] - stations[i - 1]);
    const mix = (name: keyof typeof a) =>
      a[name] + (b[name] - a[name]) * fraction;
    return {
      x: mix('x'),
      y: mix('y'),
      nx: mix('nx'),
      ny: mix('ny'),
      top: mix('top'),
      bottom: mix('bottom'),
    };
  };
  type Station = ReturnType<typeof at>;
  const offset = (p: Station, sideways: number, z: number): Point => [
    p.x + p.nx * sideways,
    p.y + p.ny * sideways,
    z,
  ];
  const battery = name === 'Half Moon Battery';
  const sill = 2.08;
  const lintel = 0.62;
  for (let i = 1; i < cuts.length; i++) {
    const start = cuts[i - 1];
    const end = cuts[i];
    if (end - start < 0.001) continue;
    const a = at(start);
    const b = at(end);
    const from = (p: Station, z: number) =>
      offset(
        p,
        -Math.min(
          battery ? 1.5 : 0.56,
          Math.max(0, p.top - z) * (battery ? 0.061 : 0.047),
        ),
        z,
      );
    const to = (p: Station, z: number) => offset(p, thickness, z);
    const wall = (
      al: number,
      bl: number,
      ah: number,
      bh: number,
      material: Stone,
    ) => {
      add([from(a, al), from(b, bl), from(b, bh), from(a, ah)], material);
      add([to(b, bl), to(a, al), to(a, ah), to(b, bh)], material);
    };
    const cap = (az: number, bz: number, material: Stone) =>
      add([from(a, az), from(b, bz), to(b, bz), to(a, az)], material);
    const reveal = (
      p: Station,
      bottom: number,
      top: number,
      reverse: boolean,
    ) => {
      const face = [
        from(p, bottom),
        to(p, bottom),
        to(p, top),
        from(p, top),
      ] as const;
      add(reverse ? [face[3], face[2], face[1], face[0]] : face, 'shadow');
    };
    const hole = holes.find(([left, right]) => start < right && end > left);
    const topA = a.top - 0.22;
    const topB = b.top - 0.22;
    if (hole) {
      wall(a.bottom, b.bottom, a.top - sill, b.top - sill, 'rubble');
      wall(a.top - lintel, b.top - lintel, topA, topB, 'rubble');
      cap(a.top - sill, b.top - sill, 'dressing');
      add(
        [
          to(a, a.top - lintel),
          to(b, b.top - lintel),
          from(b, b.top - lintel),
          from(a, a.top - lintel),
        ],
        'shadow',
      );
      if (start === hole[0]) reveal(a, a.top - sill, a.top - lintel, true);
      if (end === hole[1]) reveal(b, b.top - sill, b.top - lintel, false);
    } else {
      wall(a.bottom, b.bottom, topA, topB, 'rubble');
    }
    wall(topA, topB, a.top, b.top, 'dressing');
    cap(a.top, b.top, 'dressing');
    if (!start) reveal(a, a.bottom, a.top, false);
    if (end === length) reveal(b, b.bottom, b.top, true);
    if (!battery) continue;
    // Shallow, projecting string courses on the surveyed curve.
    for (const level of [114.6, 120.4, 126.1, 132.2]) {
      if (Math.max(a.bottom, b.bottom) >= level - 0.2) continue;
      const lip = (p: Station, z: number) =>
        offset(p, -0.16 - (p.top - z) * 0.061, z);
      add(
        [
          lip(a, level),
          lip(b, level),
          lip(b, level + 0.19),
          lip(a, level + 0.19),
        ],
        'dressing',
      );
      add(
        [
          lip(a, level + 0.19),
          lip(b, level + 0.19),
          from(b, level + 0.19),
          from(a, level + 0.19),
        ],
        'dressing',
      );
    }
  }
}

/** Bake the landmark into the existing Edinburgh wall sections and tile scheme. */
export function buildEdinburghCastle() {
  const wallTiles = new Map<string, number[]>();
  const add: AddFace = (points, material) => {
    const [a, b, c] = points;
    const u = b.map((n, i) => n - a[i]);
    const v = c.map((n, i) => n - a[i]);
    const nx = u[1] * v[2] - u[2] * v[1];
    const ny = u[2] * v[0] - u[0] * v[2];
    const nz = u[0] * v[1] - u[1] * v[0];
    const area = Math.hypot(nx, ny, nz);
    if (area < 0.00001) return;
    const light =
      0.83 +
      Math.max(-0.23, ((nx * 0.45 - ny * 0.57 + nz * 0.65) / area) * 0.34);
    const centerX = points.reduce((sum, p) => sum + p[0], 0) / points.length;
    const centerY = points.reduce((sum, p) => sum + p[1], 0) / points.length;
    const key = `${Math.floor((origin.x + centerX * metre) * 2 ** edinburghMeshZoom)}-${Math.floor((origin.y - centerY * metre) * 2 ** edinburghMeshZoom)}`;
    let output = wallTiles.get(key);
    if (!output) wallTiles.set(key, (output = []));
    const acrossX = Math.abs(nx) < Math.abs(ny);
    const flat = Math.abs(nz / area) > 0.73;
    const vertices = points.map(([x, y, z]) => [
      (origin.x + x * metre) * scale - wallOriginTile.x * roofTileExtent,
      (origin.y - y * metre) * scale - wallOriginTile.y * roofTileExtent,
      z,
      flat || acrossX ? x : y,
      flat ? y : z,
      light,
      0,
      0,
      materials.indexOf(material),
      -4,
      x / 20,
      y / 20,
    ]);
    output.push(...vertices[0], ...vertices[1], ...vertices[2]);
    if (vertices.length === 4)
      output.push(...vertices[0], ...vertices[2], ...vertices[3]);
  };
  for (const wall of source.walls) appendCurtain(add, wall);
  const front = local(source.gatehouse.front as LngLat);
  const back = local(source.gatehouse.back as LngLat);
  const length = Math.hypot(back.x - front.x, back.y - front.y);
  const dx = (back.x - front.x) / length;
  const dy = (back.y - front.y) / length;
  const locate = ([u, depth, z]: Point): Point => [
    front.x + u * dy + depth * dx,
    front.y - u * dx + depth * dy,
    source.gatehouse.floor + z,
  ];
  const gate: AddFace = ([a, b, c, d], material) =>
    add(
      d
        ? [locate(a), locate(b), locate(c), locate(d)]
        : [locate(a), locate(b), locate(c)],
      material,
    );
  appendGatehouse(gate, length);
  return wallTiles;
}
