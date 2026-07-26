import { toTileCoordinate } from './parking-data-utils.mjs';

export const CYCLE_NETWORK_CHUNK_ZOOM = 10;
export const CYCLE_NETWORK_SCHEMA_VERSION = 2;

const knownKinds = new Map([
  ['Ferry', 'ferry'],
  ['OnRoad', 'on-road'],
  ['TrafficFree', 'traffic-free'],
]);
const knownRouteTypes = new Map([
  ['LINK', 'link'],
  ['NCN', 'ncn'],
  ['RCN', 'rcn'],
]);
const knownOpenStatuses = new Map([
  ['Open', 'open'],
  ['Temporary Closure', 'temporary-closure'],
]);
const knownSurfaces = new Map([
  ['Asphalt', 'asphalt'],
  ['BareEarth', 'bare-earth'],
  ['Blocks', 'paving-blocks'],
  ['Cobbles', 'cobbles'],
  ['Concrete', 'concrete'],
  ['FlexSurface', 'flexible-surface'],
  ['Grass', 'grass'],
  ['Other', 'other'],
  ['PavementSlabs', 'paving-slabs'],
  ['Rocky', 'rocky'],
  ['Unsealed Firm', 'unsealed-firm'],
  ['UnsealedFirm', 'unsealed-firm'],
  ['UnsealedLoose', 'unsealed-loose'],
]);
const knownQualities = new Map([
  ['Acceptable', 'acceptable'],
  ['MTBOnly', 'mountain-bike-only'],
  ['Rough', 'rough'],
  ['Smooth', 'smooth'],
  ['Standard', 'standard'],
]);
const knownLighting = new Map([
  ['FullLit', 'fully-lit'],
  ['NotLit', 'unlit'],
  ['PartLit', 'partly-lit'],
]);
export const CYCLE_NETWORK_SURFACES = new Set(knownSurfaces.values());
export const CYCLE_NETWORK_QUALITIES = new Set(knownQualities.values());
export const CYCLE_NETWORK_LIGHTING = new Set(knownLighting.values());

function optionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function optionalPositiveInteger(value) {
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function normalizeOptionalEnum(value, knownValues, field) {
  const normalized = optionalString(value);
  if (!normalized || normalized === 'N/A') return undefined;
  const mapped = knownValues.get(normalized);
  if (!mapped)
    throw new Error(`Unsupported cycle-network ${field}: ${normalized}`);
  return mapped;
}

function normalizeGlobalId(value) {
  const normalized = optionalString(value)
    ?.replaceAll(/[{}]/g, '')
    .toLowerCase();
  return normalized && /^[a-f0-9-]{36}$/.test(normalized) ? normalized : null;
}

function normalizeGeometry(geometry) {
  if (
    !geometry ||
    (geometry.type !== 'LineString' && geometry.type !== 'MultiLineString') ||
    !Array.isArray(geometry.coordinates)
  ) {
    return null;
  }

  const lines =
    geometry.type === 'LineString'
      ? [geometry.coordinates]
      : geometry.coordinates;
  if (
    lines.length === 0 ||
    lines.some(
      (line) =>
        !Array.isArray(line) ||
        line.length < 2 ||
        line.some(
          (coordinate) =>
            !Array.isArray(coordinate) ||
            coordinate.length < 2 ||
            !Number.isFinite(coordinate[0]) ||
            !Number.isFinite(coordinate[1]) ||
            coordinate[0] < -180 ||
            coordinate[0] > 180 ||
            coordinate[1] < -90 ||
            coordinate[1] > 90,
        ),
    )
  ) {
    return null;
  }

  return {
    coordinates: geometry.coordinates,
    type: geometry.type,
  };
}

export function normalizeCycleNetworkFeature(feature) {
  const properties = feature?.properties ?? {};
  const globalId = normalizeGlobalId(properties.GlobalID);
  const geometry = normalizeGeometry(feature?.geometry);
  if (!globalId || !geometry) return null;

  const greenway = optionalString(properties.Greenway)?.toLowerCase();
  return {
    geometry,
    id: `ncn:${globalId}`,
    properties: {
      greenway: greenway === 'yes' ? true : greenway === 'no' ? false : null,
      kind: knownKinds.get(properties.Desc_) ?? 'unknown',
      lighting: normalizeOptionalEnum(
        properties.Lighting,
        knownLighting,
        'lighting',
      ),
      linkNumber: optionalPositiveInteger(properties.LinkNo),
      openStatus: knownOpenStatuses.get(properties.OpenStatus) ?? 'unknown',
      quality: normalizeOptionalEnum(
        properties.Quality,
        knownQualities,
        'quality',
      ),
      roadClass: optionalString(properties.RoadClass),
      routeCategory: optionalString(properties.RouteCat),
      routeNumber: optionalPositiveInteger(properties.RouteNo),
      routeType: knownRouteTypes.get(properties.RouteType) ?? 'unknown',
      segmentId: Number.isInteger(properties.SegmentID)
        ? properties.SegmentID
        : undefined,
      surface: normalizeOptionalEnum(
        properties.Surface,
        knownSurfaces,
        'surface',
      ),
    },
    type: 'Feature',
  };
}

export function coordinatesForGeometry(geometry) {
  return geometry.type === 'LineString'
    ? geometry.coordinates
    : geometry.coordinates.flat();
}

export function getCycleNetworkFeatureBounds(feature) {
  const coordinates = coordinatesForGeometry(feature.geometry);
  return coordinates.reduce(
    (bounds, [longitude, latitude]) => ({
      east: Math.max(bounds.east, longitude),
      north: Math.max(bounds.north, latitude),
      south: Math.min(bounds.south, latitude),
      west: Math.min(bounds.west, longitude),
    }),
    { east: -Infinity, north: -Infinity, south: Infinity, west: Infinity },
  );
}

export function getCycleNetworkTileKeys(
  feature,
  zoom = CYCLE_NETWORK_CHUNK_ZOOM,
) {
  const bounds = getCycleNetworkFeatureBounds(feature);
  const northWest = toTileCoordinate(bounds.north, bounds.west, zoom);
  const southEast = toTileCoordinate(bounds.south, bounds.east, zoom);
  const keys = [];

  for (let y = northWest.y; y <= southEast.y; y += 1) {
    for (let x = northWest.x; x <= southEast.x; x += 1) {
      keys.push(`${zoom}/${x}/${y}`);
    }
  }
  return keys;
}

export function summarizeCycleNetworkFeatures(features) {
  const byKind = {};
  const byOpenStatus = {};
  const byRouteType = {};
  const geometryTypes = {};
  let vertices = 0;

  for (const feature of features) {
    byKind[feature.properties.kind] =
      (byKind[feature.properties.kind] ?? 0) + 1;
    byOpenStatus[feature.properties.openStatus] =
      (byOpenStatus[feature.properties.openStatus] ?? 0) + 1;
    byRouteType[feature.properties.routeType] =
      (byRouteType[feature.properties.routeType] ?? 0) + 1;
    geometryTypes[feature.geometry.type] =
      (geometryTypes[feature.geometry.type] ?? 0) + 1;
    vertices += coordinatesForGeometry(feature.geometry).length;
  }

  return { byKind, byOpenStatus, byRouteType, geometryTypes, vertices };
}
