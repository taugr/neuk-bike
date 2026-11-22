import {
  MercatorCoordinate,
  type LngLatLike,
  type Map as LibreMap,
} from 'maplibre-gl';
import { aerialBuildingsLayerId } from './map-satellite';

export type SightPoint = readonly [east: number, south: number, height: number];
export type BuildingTriangle = readonly [SightPoint, SightPoint, SightPoint];
export type ParkingSightCamera = {
  bearing: number;
  pitch: number;
  zoom: number;
  offset: [number, number];
};

type FindRevealBearing = (
  location: LngLatLike,
  height: number,
  camera: ParkingSightCamera,
) => number | null | undefined;

const providers = new WeakMap<LibreMap, FindRevealBearing>();

export function registerBuildingSightlines(
  map: LibreMap,
  findBearing: FindRevealBearing,
) {
  providers.set(map, findBearing);
  return () => {
    if (providers.get(map) === findBearing) providers.delete(map);
  };
}

export function parkingRevealBearing(
  map: LibreMap,
  location: LngLatLike,
  height: number,
  camera: ParkingSightCamera,
) {
  return (
    providers.get(map)?.(location, height, camera) ??
    nativeBuildingRevealBearing(map, location, height, camera)
  );
}

export function parkingCameraOffset(
  { pitch, bearing, offset }: ParkingSightCamera,
  cameraDistance: number,
): SightPoint {
  const tilt = (pitch * Math.PI) / 180;
  const angle = (bearing * Math.PI) / 180;
  const sin = Math.sin(tilt);
  const cos = Math.cos(tilt);
  // The pixel offset follows a ray from the camera through the screen.
  // Scale that ray to intersect the map plane at the selected neuk.
  const [x, y] = offset;
  const depth = cos / (cos + (y / cameraDistance) * sin);
  const east = -x * depth;
  const south = (cameraDistance * sin - y * cos) * depth;
  return [
    east * Math.cos(angle) - south * Math.sin(angle),
    east * Math.sin(angle) + south * Math.cos(angle),
    cameraDistance * cos,
  ];
}

const subtract = (a: SightPoint, b: SightPoint): SightPoint => [
  a[0] - b[0],
  a[1] - b[1],
  a[2] - b[2],
];
const cross = (a: SightPoint, b: SightPoint): SightPoint => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a: SightPoint, b: SightPoint) =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// Test the segment from the fixture to the camera, including both sides of
// walls and roofs. Ignore surfaces touching either endpoint.
function blocksSightline(
  origin: SightPoint,
  direction: SightPoint,
  [a, b, c]: BuildingTriangle,
) {
  const edge = subtract(b, a);
  const otherEdge = subtract(c, a);
  const normal = cross(direction, otherEdge);
  const determinant = dot(edge, normal);
  if (Math.abs(determinant) < 1e-8) return false;
  const offset = subtract(origin, a);
  const u = dot(offset, normal) / determinant;
  if (u < 0 || u > 1) return false;
  const secondary = cross(offset, edge);
  const v = dot(direction, secondary) / determinant;
  if (v < 0 || u + v > 1) return false;
  const fraction = dot(otherEdge, secondary) / determinant;
  return fraction > 1e-5 && fraction < 1 - 1e-5;
}

const orbitOffsets = [
  20, -20, 40, -40, 65, -65, 90, -90, 120, -120, 150, -150, 180,
];

export function findClearBuildingBearing(
  target: SightPoint,
  eye: SightPoint,
  bearing: number,
  triangles: readonly BuildingTriangle[],
) {
  const direction = subtract(eye, target);
  const blocked = (ray: SightPoint) =>
    triangles.some((triangle) => blocksSightline(target, ray, triangle));
  return clearBearing(direction, bearing, blocked);
}

function clearBearing(
  direction: SightPoint,
  bearing: number,
  blocked: (ray: SightPoint) => boolean,
) {
  if (!blocked(direction)) return null;
  for (const offset of orbitOffsets) {
    const angle = (offset * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    if (
      !blocked([
        direction[0] * cos - direction[1] * sin,
        direction[0] * sin + direction[1] * cos,
        direction[2],
      ])
    )
      return bearing + offset;
  }
  return null;
}

type FootprintPoint = [number, number];
type BuildingPrism = {
  rings: FootprintPoint[][];
  base: number;
  roof: number;
};

export function blocksBuildingPrism(
  ray: SightPoint,
  { rings, base, roof }: BuildingPrism,
) {
  const [east, south, up] = ray;
  // The origin is the neuk. Check for a roof hit and then the walls, including
  // courtyard walls, before the segment reaches the proposed camera.
  const roofHit = roof / up;
  if (roofHit > 0 && roofHit < 1) {
    const x = east * roofHit;
    const y = south * roofHit;
    const inside = (ring: FootprintPoint[]) => {
      let hit = false;
      for (let i = 1; i < ring.length; i++) {
        const [ax, ay] = ring[i - 1];
        const [bx, by] = ring[i];
        if (ay > y !== by > y && x < ax + ((bx - ax) * (y - ay)) / (by - ay))
          hit = !hit;
      }
      return hit;
    };
    if (inside(rings[0]) && !rings.slice(1).some(inside)) return true;
  }
  return rings.some((ring) => {
    for (let i = 1; i < ring.length; i++) {
      const [x, y] = ring[i - 1];
      const dx = ring[i][0] - x;
      const dy = ring[i][1] - y;
      const determinant = east * dy - south * dx;
      if (Math.abs(determinant) < 1e-8) continue;
      const hit = (x * dy - y * dx) / determinant;
      const alongWall = (x * south - y * east) / determinant;
      const height = hit * up;
      if (
        hit > 1e-5 &&
        hit < 1 &&
        alongWall >= 0 &&
        alongWall <= 1 &&
        height >= base &&
        height <= roof
      )
        return true;
    }
    return false;
  });
}

function nativeBuildingRevealBearing(
  map: LibreMap,
  location: LngLatLike,
  height: number,
  camera: ParkingSightCamera,
) {
  if (!map.getLayer(aerialBuildingsLayerId) || map.getZoom() < 15) return null;
  const origin = MercatorCoordinate.fromLngLat(location);
  const units = origin.meterInMercatorCoordinateUnits();
  const ground = (map.queryTerrainElevation(location) ?? 0) + height;
  const distance =
    map.getCanvas().clientHeight /
    (2 * Math.tan((map.getVerticalFieldOfView() * Math.PI) / 360));
  const metresPerPixel = 1 / (512 * 2 ** camera.zoom * units);
  const [x, y, z] = parkingCameraOffset(camera, distance);
  const direction: SightPoint = [
    x * metresPerPixel,
    y * metresPerPixel,
    z * metresPerPixel - height,
  ];
  const radius = Math.hypot(direction[0], direction[1]);
  const geometry = map.queryRenderedFeatures({
    layers: [aerialBuildingsLayerId],
  });
  const buildings: BuildingPrism[] = [];
  for (const { geometry: shape, properties } of geometry) {
    const roof = properties.render_height;
    if (typeof roof !== 'number' || roof <= 0) continue;
    const polygons: number[][][][] =
      shape.type === 'Polygon'
        ? [shape.coordinates]
        : shape.type === 'MultiPolygon'
          ? shape.coordinates
          : [];
    for (const polygon of polygons) {
      const outline = polygon[0];
      if (!outline?.length) continue;
      const rings = polygon.map((ring) =>
        ring.map(([lng, lat]): FootprintPoint => {
          const p = MercatorCoordinate.fromLngLat([lng, lat]);
          return [(p.x - origin.x) / units, (p.y - origin.y) / units];
        }),
      );
      if (
        rings[0].every(([east]) => east < -radius) ||
        rings[0].every(([east]) => east > radius) ||
        rings[0].every(([, south]) => south < -radius) ||
        rings[0].every(([, south]) => south > radius)
      )
        continue;
      const [lng, lat] = outline[0];
      const base = (map.queryTerrainElevation([lng, lat]) ?? 0) - ground;
      buildings.push({
        rings,
        base: base + (Number(properties.render_min_height) || 0),
        roof: base + roof,
      });
    }
  }
  return clearBearing(direction, camera.bearing, (ray) =>
    buildings.some((building) => blocksBuildingPrism(ray, building)),
  );
}

export function collectNearbyBuildingTriangles(
  nearby: BuildingTriangle[],
  vertices: Float32Array,
  indices: Uint16Array | Uint32Array,
  stride: number,
  target: SightPoint,
  radius: number,
  first = 0,
  count = indices.length,
) {
  const [x, y] = target;
  const left = x - radius;
  const right = x + radius;
  const north = y - radius;
  const south = y + radius;
  for (let i = first; i < first + count; i += 3) {
    const a = indices[i] * stride;
    const b = indices[i + 1] * stride;
    const c = indices[i + 2] * stride;
    if (
      Math.min(vertices[a], vertices[b], vertices[c]) > right ||
      Math.max(vertices[a], vertices[b], vertices[c]) < left ||
      Math.min(vertices[a + 1], vertices[b + 1], vertices[c + 1]) > south ||
      Math.max(vertices[a + 1], vertices[b + 1], vertices[c + 1]) < north
    )
      continue;
    nearby.push([
      [vertices[a], vertices[a + 1], vertices[a + 2]],
      [vertices[b], vertices[b + 1], vertices[b + 2]],
      [vertices[c], vertices[c + 1], vertices[c + 2]],
    ]);
  }
}
