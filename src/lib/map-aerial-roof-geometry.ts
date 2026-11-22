import {
  MercatorCoordinate,
  type GeoJSONFeature,
  type LngLatBounds,
  type Map as LibreMap,
} from 'maplibre-gl';
import type { ShopfrontMatcher } from './map-aerial-shopfronts';
import { appendAerialWalls } from './map-aerial-walls';
import { stockbridgeTerraceFaces } from './stockbridge-terraces';
import { historicFacadeFaces } from './edinburgh-historic-facades';
import { parseFacadeJoints, type FacadeJoints } from './map-terrace-joints';
import { fitPrincesStreetCornice } from './princes-street-architecture';
import {
  princesStreetFlatRoofCenter,
  princesStreetModeledRoofBounds,
  princesStreetRoofMetres,
  princesStreetRoofPlane,
  type PrincesStreetRoofPhotoMode,
} from './princes-street-roof-photo';
import {
  fitRoofProfile,
  roofContainsPoint,
  subdivideRoof,
  type RoofSurvey,
} from './waverley-roof-profile';

export const roofImageryZoom = 18;
export const roofTileExtent = 8192;
export const materialRoofStride = 11;
// Roughly 4.3 ground metres at Waverley.
const roofMeshStep = 1 / (2 ** roofImageryZoom * 20);
const tileCount = 2 ** roofImageryZoom;
const west = -3.193;
const east = -3.184;
const south = 55.9515;
const north = 55.9555;
const northwest = MercatorCoordinate.fromLngLat([west, north]);
const southeast = MercatorCoordinate.fromLngLat([east, south]);
const minTileX = Math.floor(northwest.x * tileCount);
const maxTileX = Math.floor(southeast.x * tileCount);
const minTileY = Math.floor(northwest.y * tileCount);
const maxTileY = Math.floor(southeast.y * tileCount);
export const wallOriginTile = { x: minTileX, y: minTileY, z: roofImageryZoom };
const wallOrigin = { x: minTileX / tileCount, y: minTileY / tileCount };

type Point = { x: number; y: number };
type Edge = { start: Point; end: Point };
export type RoofTile = { x: number; y: number; z: number; vertices: number[] };

export function roofTileKey(x: number, y: number, z: number) {
  return z === roofImageryZoom ? `${x}/${y}` : `${z}/${x}/${y}`;
}

export function roofDetailTilesInView(
  bounds: LngLatBounds,
  z = roofImageryZoom,
) {
  const nw = MercatorCoordinate.fromLngLat(bounds.getNorthWest());
  const se = MercatorCoordinate.fromLngLat(bounds.getSouthEast());
  const scale = 2 ** z;
  return {
    z,
    minX: Math.floor(Math.max(northwest.x, nw.x) * scale),
    minY: Math.floor(Math.max(northwest.y, nw.y) * scale),
    maxX: Math.floor(Math.min(southeast.x, se.x) * scale),
    maxY: Math.floor(Math.min(southeast.y, se.y) * scale),
  };
}

function xAtY({ start, end }: Edge, y: number) {
  return start.x + ((y - start.y) / (end.y - start.y)) * (end.x - start.x);
}

/** Split a polygon into horizontal bands. Pair crossings using even-odd fill,
 * so concave outlines and interior courtyards keep their shape. */
export function roofTriangles(rings: readonly Point[][]) {
  const levels = [...new Set(rings.flatMap((ring) => ring.map(({ y }) => y)))];
  levels.sort((a, b) => a - b);
  const edges = rings.flatMap((ring) =>
    ring.flatMap((start, index) => {
      const end = ring[(index + 1) % ring.length];
      return start.y === end.y ? [] : [{ start, end }];
    }),
  );
  const triangles: Point[][] = [];
  for (let row = 1; row < levels.length; row++) {
    const top = levels[row - 1];
    const bottom = levels[row];
    const middle = (top + bottom) / 2;
    const crossings = edges
      .filter(({ start, end }) => start.y < middle !== end.y < middle)
      .sort((a, b) => xAtY(a, middle) - xAtY(b, middle));
    for (let i = 1; i < crossings.length; i += 2) {
      const left = crossings[i - 1];
      const right = crossings[i];
      const a = { x: xAtY(left, top), y: top };
      const b = { x: xAtY(right, top), y: top };
      const c = { x: xAtY(right, bottom), y: bottom };
      const d = { x: xAtY(left, bottom), y: bottom };
      if (a.x < b.x) triangles.push([a, b, c]);
      if (d.x < c.x) triangles.push([a, c, d]);
    }
  }
  return triangles;
}

type Footprint = {
  polygon: number[][][];
  height: number;
  base: number;
  joints?: FacadeJoints;
  historic?: ReturnType<typeof historicFacadeFaces>;
};

const trainShedSample = MercatorCoordinate.fromLngLat([-3.1889, 55.95228]);

// Choose an interior point with enough clearance for a small imagery sample,
// including on concave footprints and buildings with courtyards.
function roofColorSample(faces: Point[][], fallback: Point) {
  let point = fallback;
  let radius = 0;
  for (const [a, b, c] of faces) {
    const oppositeA = Math.hypot(b.x - c.x, b.y - c.y);
    const oppositeB = Math.hypot(a.x - c.x, a.y - c.y);
    const oppositeC = Math.hypot(a.x - b.x, a.y - b.y);
    const perimeter = oppositeA + oppositeB + oppositeC;
    if (!perimeter) continue;
    const twiceArea = Math.abs(
      (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x),
    );
    const inradius = twiceArea / perimeter;
    if (inradius > radius) {
      radius = inradius;
      point = {
        x: (oppositeA * a.x + oppositeB * b.x + oppositeC * c.x) / perimeter,
        y: (oppositeA * a.y + oppositeB * b.y + oppositeC * c.y) / perimeter,
      };
    }
  }
  return { point, radius };
}

type ElevatedRoofPoint = Point & { elevation: number };

function roofVertexKey({ x, y }: Point) {
  const extent = tileCount * roofTileExtent;
  return `${Math.round(x * extent)}/${Math.round(y * extent)}`;
}

function smoothRoofNormals(
  faces: ElevatedRoofPoint[][],
  metresPerUnit: number,
) {
  const normals = new Map<string, { x: number; y: number; z: number }>();
  for (const [a, b, c] of faces) {
    const bx = (b.x - a.x) * metresPerUnit;
    const by = (b.y - a.y) * metresPerUnit;
    const bz = b.elevation - a.elevation;
    const cx = (c.x - a.x) * metresPerUnit;
    const cy = (c.y - a.y) * metresPerUnit;
    const cz = c.elevation - a.elevation;
    const z = bx * cy - by * cx;
    if (Math.abs(z) < 0.0001) continue;
    const sign = Math.sign(z);
    const x = (by * cz - bz * cy) * sign;
    const y = (bz * cx - bx * cz) * sign;
    // The cross product weights the normal by face area. Vertices shared by
    // adjacent triangles use the same light direction.
    for (const point of [a, b, c]) {
      const key = roofVertexKey(point);
      const sum = normals.get(key) ?? { x: 0, y: 0, z: 0 };
      sum.x += x;
      sum.y += y;
      sum.z += Math.abs(z);
      normals.set(key, sum);
    }
  }
  for (const normal of normals.values()) {
    const length = Math.hypot(normal.x, normal.y, normal.z);
    normal.x /= length;
    normal.y /= length;
  }
  return normals;
}

function roofMaterialAxis(outline: Point[]): Point {
  let longest = 0;
  let axis = { x: 1, y: 0 };
  for (const [index, start] of outline.entries()) {
    const end = outline[(index + 1) % outline.length];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length <= longest) continue;
    longest = length;
    const direction = dx < 0 || (dx === 0 && dy < 0) ? -1 : 1;
    axis = { x: (dx / length) * direction, y: (dy / length) * direction };
  }
  return axis;
}

export function buildAerialBuildings(
  features: readonly Pick<GeoJSONFeature, 'geometry' | 'properties'>[],
  getTerrainElevation: LibreMap['queryTerrainElevation'],
  {
    survey,
    fineSurvey,
    materials = false,
    detailTiles,
    shopfront,
    photoFrontage,
    photoGate,
    modeledFrontage,
    edinburghPilot,
    compactCity = false,
    cityScale = false,
    registeredRoof,
  }: {
    survey?: RoofSurvey;
    fineSurvey?: RoofSurvey;
    materials?: boolean;
    detailTiles?: ReturnType<typeof roofDetailTilesInView>;
    shopfront?: ShopfrontMatcher;
    photoFrontage?: boolean;
    photoGate?: boolean;
    modeledFrontage?: boolean;
    edinburghPilot?: 'overview' | 'detail' | 'city';
    compactCity?: boolean;
    cityScale?: boolean;
    registeredRoof?: PrincesStreetRoofPhotoMode;
  } = {},
) {
  const roofs = new Map<string, RoofTile>();
  const photoZoom = detailTiles?.z ?? roofImageryZoom;
  const photoScale = 2 ** photoZoom;
  const walls: number[] = [];
  const materialRoofs = new Map<string, RoofTile>();
  const outlines: number[] = [];
  let includesPhoto = false;
  let includesFrontage = false;
  let measuredBuildings = 0;
  let detailedBuildings = 0;
  let measuredBands = 0;
  let modeledOpenings = 0;
  const historicBuildings = { 'old-town': 0, 'new-town': 0 };
  const historicOpenings = { 'old-town': 0, 'new-town': 0 };
  let modeledRoofs = 0;
  let generatedBuildings = 0;
  let shopfrontSegments = 0;
  const pavementElevation = survey && ((point: Point) => survey(point)?.ground);
  const buildings = new Map<string, Footprint>();
  for (const { geometry, properties } of features) {
    if (properties.hide_3d === true) continue;
    const height = properties.render_height;
    if (typeof height !== 'number' || !(height > 0)) continue;
    const base =
      typeof properties.render_min_height === 'number'
        ? Math.max(0, properties.render_min_height)
        : 0;
    const polygons: number[][][][] =
      geometry.type === 'Polygon'
        ? [geometry.coordinates]
        : geometry.type === 'MultiPolygon'
          ? geometry.coordinates
          : [];
    for (const polygon of polygons) {
      if (!polygon[0]?.length) continue;
      if (
        !edinburghPilot &&
        !polygon[0].some(
          ([lng, lat]) =>
            lng >= west && lng <= east && lat >= south && lat <= north,
        )
      )
        continue;
      const key = JSON.stringify([height, base, polygon[0]]);
      const existing = buildings.get(key);
      // Tile fragments can repeat an outline with different interior detail.
      if (!existing || polygon.length > existing.polygon.length)
        buildings.set(key, {
          polygon,
          height,
          base,
          joints:
            edinburghPilot === 'city' && !cityScale
              ? parseFacadeJoints(properties)
              : undefined,
          historic:
            edinburghPilot === 'city' && !compactCity
              ? historicFacadeFaces(properties.historic_facade)
              : undefined,
        });
    }
  }
  for (const building of buildings.values()) {
    const { polygon, height, base } = building;
    // Native extrusions sample terrain at the average of each ring's vertices.
    const rings = polygon.map((ring) =>
      ring
        .slice(0, -1)
        .map(([lng, lat]) => MercatorCoordinate.fromLngLat([lng, lat])),
    );
    let centerX = 0;
    let centerY = 0;
    let count = 0;
    for (const ring of rings) {
      for (const point of ring) {
        centerX += point.x;
        centerY += point.y;
        count++;
      }
    }
    if (!count) continue;
    generatedBuildings++;
    const centroid = new MercatorCoordinate(centerX / count, centerY / count);
    const center = centroid.toLngLat();
    // Use the same finish on the low roof sections over the station
    // platforms, including sections split across adjacent vector tiles.
    const trainShed =
      height <= 18 &&
      center.lng > -3.19182 &&
      center.lng < -3.18568 &&
      center.lat > 55.95125 &&
      center.lat < 55.95286;
    const showEdge =
      !trainShed ||
      (polygon[0].some(([lng]) => lng < -3.1905) &&
        polygon[0].some(([lng]) => lng > -3.1874));
    const terrain = getTerrainElevation(center) ?? 0;
    const elevation = height + terrain + 0.15;
    const profile =
      survey && fitRoofProfile(rings, survey, elevation, fineSurvey);
    if (profile && profile.measured) measuredBuildings++;
    if (profile?.fine) detailedBuildings++;
    const metresPerUnit = 1 / centroid.meterInMercatorCoordinateUnits();
    const measuredElevation =
      modeledFrontage && profile?.measured && !base
        ? fitPrincesStreetCornice(rings[0], metresPerUnit, profile.elevationAt)
        : (profile?.elevationAt ?? (() => elevation));
    const flatRoof =
      (registeredRoof || modeledFrontage) &&
      profile?.measured &&
      roofContainsPoint(rings, princesStreetFlatRoofCenter);
    const elevationAt = flatRoof
      ? (point: Point) =>
          princesStreetRoofPlane(
            point,
            measuredElevation(point),
            registeredRoof === 'detail',
          )
      : measuredElevation;
    const meshStep = profile?.fine
      ? roofMeshStep / 4
      : flatRoof || (edinburghPilot === 'detail' && profile?.measured)
        ? roofMeshStep / 2
        : edinburghPilot === 'city'
          ? roofMeshStep * (cityScale ? 6 : compactCity ? 2.5 : 1.25)
          : roofMeshStep;
    // Low structures use masonry. The modern blocks north of Waterloo Place
    // use wider glazing bays than the older masonry buildings in the valley.
    const variation = Math.sin(
      (centerX / count) * 81917 + (centerY / count) * 157733,
    );
    const material =
      height - base < 6
        ? 1
        : center.lat > 55.95365 && center.lng > -3.1888
          ? 2
          : 0;
    if (height > base) {
      const terraceFaces =
        !compactCity && !base && building.joints && edinburghPilot === 'city'
          ? stockbridgeTerraceFaces(
              centroid,
              rings[0],
              metresPerUnit,
              !!(
                building.joints.partyWalls.length ||
                building.joints.divisions.length
              ),
            )
          : undefined;
      const wall = appendAerialWalls(walls, rings, {
        height,
        base,
        terrain,
        origin: wallOrigin,
        tileScale: tileCount * roofTileExtent,
        metresPerUnit,
        material,
        masonry: edinburghPilot
          ? variation > 0.35
            ? 4
            : variation < -0.35
              ? 3
              : 2
          : undefined,
        facadeJoints: building.joints,
        terraceFaces,
        historicFaces: building.historic?.layouts,
        profile: materials ? elevationAt : undefined,
        outlines: materials && showEdge && !compactCity ? outlines : undefined,
        shopfront:
          materials && !trainShed && base === 0 ? shopfront : undefined,
        pavementElevation,
        photoFrontage,
        photoGate,
        surveyFrontage: !!profile?.fine,
        modeledFrontage: modeledFrontage && profile?.measured,
        step: edinburghPilot && !profile?.measured ? Infinity : meshStep,
      });
      includesPhoto ||= wall.includesPhoto;
      includesFrontage ||= wall.includesFrontage;
      shopfrontSegments += wall.shopfrontSegments;
      measuredBands += wall.measuredBands;
      modeledOpenings += wall.modeledOpenings;
      if (building.historic && wall.historicOpenings) {
        historicBuildings[building.historic.district]++;
        historicOpenings[building.historic.district] += wall.historicOpenings;
      }
    }
    const faces = roofTriangles(rings);
    const triangles =
      profile && profile.measured
        ? faces.flatMap((triangle) => subdivideRoof(triangle, meshStep))
        : faces;
    const mesh = triangles.map((face) =>
      face.map((point) => ({ ...point, elevation: elevationAt(point) })),
    );
    if (materials) {
      const { point, radius } = edinburghPilot
        ? { point: wallOrigin, radius: 0 }
        : trainShed
          ? {
              point: trainShedSample,
              radius: 4 * trainShedSample.meterInMercatorCoordinateUnits(),
            }
          : roofColorSample(faces, centroid);
      const x = Math.floor(point.x * tileCount);
      const y = Math.floor(point.y * tileCount);
      const u = point.x * tileCount - x;
      const v = point.y * tileCount - y;
      // The mip level averages the photographed colour, while the building's
      // interior and the texture edge limit the size of the sample.
      const sampleWidth = Math.min(
        16,
        radius * tileCount * 256,
        Math.min(u, v, 1 - u, 1 - v) * 256,
      );
      const lod = Math.log2(Math.max(1, sampleWidth));
      const tileKey = `${x}/${y}`;
      const tile = materialRoofs.get(tileKey) ?? {
        x,
        y,
        z: roofImageryZoom,
        vertices: [],
      };
      const normals =
        edinburghPilot && !profile?.measured
          ? undefined
          : smoothRoofNormals(mesh, metresPerUnit);
      let pitchedShare = 0;
      if (edinburghPilot && normals?.size) {
        let pitched = 0;
        for (const { x, y } of normals.values())
          if (x * x + y * y > 0.22 ** 2) pitched++;
        pitchedShare = pitched / normals.size;
      }
      const axis = trainShed
        ? { x: 0.984, y: -0.177 }
        : roofMaterialAxis(rings[0]);
      const modeled = modeledFrontage && profile?.measured && !trainShed;
      let includesModeledRoof = false;
      const [minX, minY, maxX, maxY] = princesStreetModeledRoofBounds;
      for (const face of mesh) {
        const roofMetres = modeled
          ? face.map(princesStreetRoofMetres)
          : undefined;
        const modeledFace = roofMetres?.some(
          ([x, y]) => x >= minX && x <= maxX && y >= minY && y <= maxY,
        );
        includesModeledRoof ||= !!modeledFace;
        for (const [i, point] of face.entries()) {
          const normal = normals?.get(roofVertexKey(point));
          tile.vertices.push(
            (point.x - wallOrigin.x) * tileCount * roofTileExtent,
            (point.y - wallOrigin.y) * tileCount * roofTileExtent,
            point.elevation,
            edinburghPilot ? variation : modeledFace ? roofMetres![i][0] : u,
            edinburghPilot ? pitchedShare : modeledFace ? roofMetres![i][1] : v,
            lod,
            edinburghPilot ? 3 : modeledFace ? 2 : Number(trainShed),
            normal?.x ?? 0,
            normal?.y ?? 0,
            axis.x,
            axis.y,
          );
        }
      }
      if (includesModeledRoof) modeledRoofs++;
      materialRoofs.set(tileKey, tile);
      if (!detailTiles) continue;
    }
    for (const points of mesh) {
      const triangle = points.map(({ x, y, elevation }) => ({
        x: x * photoScale,
        y: y * photoScale,
        elevation,
      }));
      const xs = triangle.map(({ x }) => x);
      const ys = triangle.map(({ y }) => y);
      const fromX = Math.max(
        detailTiles?.minX ?? minTileX,
        Math.floor(Math.min(...xs)),
      );
      const throughX = Math.min(
        detailTiles?.maxX ?? maxTileX,
        Math.floor(Math.max(...xs)),
      );
      const fromY = Math.max(
        detailTiles?.minY ?? minTileY,
        Math.floor(Math.min(...ys)),
      );
      const throughY = Math.min(
        detailTiles?.maxY ?? maxTileY,
        Math.floor(Math.max(...ys)),
      );
      for (let x = fromX; x <= throughX; x++) {
        for (let y = fromY; y <= throughY; y++) {
          const tileKey = roofTileKey(x, y, photoZoom);
          const tile = roofs.get(tileKey) ?? {
            x,
            y,
            z: photoZoom,
            vertices: [],
          };
          for (const point of triangle) {
            tile.vertices.push(
              (point.x - x) * roofTileExtent,
              (point.y - y) * roofTileExtent,
              point.elevation,
            );
          }
          roofs.set(tileKey, tile);
        }
      }
    }
  }
  return {
    roofs,
    walls,
    materialRoofs,
    outlines,
    includesPhoto,
    includesFrontage,
    measuredBuildings,
    detailedBuildings,
    measuredBands,
    modeledOpenings,
    historicBuildings,
    historicOpenings,
    modeledRoofs,
    generatedBuildings,
    shopfrontSegments,
  };
}
