export const PARKING_SCHEMA_VERSION = 1;
export const PARKING_CHUNK_ZOOM = 12;

const earthRadiusMeters = 6_371_000;
const spatialCellSizeDegrees = 0.01;

function toRadians(value) {
  return (value * Math.PI) / 180;
}

export function distanceMeters(from, to) {
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const fromLatitude = toRadians(from.latitude);
  const toLatitude = toRadians(to.latitude);
  const halfChordLength =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) *
      Math.cos(toLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return (
    2 *
    earthRadiusMeters *
    Math.atan2(Math.sqrt(halfChordLength), Math.sqrt(1 - halfChordLength))
  );
}

export function toTileCoordinate(latitude, longitude, zoom) {
  const tileCount = 2 ** zoom;
  const clampedLatitude = Math.max(
    -85.05112878,
    Math.min(85.05112878, latitude),
  );
  const latitudeRadians = toRadians(clampedLatitude);
  const x = Math.floor(((longitude + 180) / 360) * tileCount);
  const y = Math.floor(
    ((1 - Math.asinh(Math.tan(latitudeRadians)) / Math.PI) / 2) * tileCount,
  );

  return {
    x: Math.max(0, Math.min(tileCount - 1, x)),
    y: Math.max(0, Math.min(tileCount - 1, y)),
  };
}

export function getTileKey(point, zoom = PARKING_CHUNK_ZOOM) {
  const { x, y } = toTileCoordinate(point.latitude, point.longitude, zoom);
  return `${zoom}/${x}/${y}`;
}

function tileYToLatitude(y, zoom) {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** zoom;
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

export function getTileBounds(key) {
  const [zoom, x, y] = key.split('/').map(Number);
  const tileCount = 2 ** zoom;

  return {
    east: ((x + 1) / tileCount) * 360 - 180,
    north: tileYToLatitude(y, zoom),
    south: tileYToLatitude(y + 1, zoom),
    west: (x / tileCount) * 360 - 180,
  };
}

function comparableProperty(point, key) {
  const value = point.properties[key];
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized.length > 0 ? normalized : null;
  }
  return typeof value === 'number' && value > 0 ? String(value) : null;
}

export function shouldMergeCouncilAndOsm(councilPoint, osmPoint) {
  const separation = distanceMeters(councilPoint, osmPoint);
  if (separation <= 4) {
    return true;
  }
  if (separation > 15) {
    return false;
  }

  return ['capacity', 'covered', 'access', 'bicycle_pa'].some((key) => {
    const councilValue = comparableProperty(councilPoint, key);
    const osmValue = comparableProperty(osmPoint, key);
    return councilValue !== null && councilValue === osmValue;
  });
}

export function mergeParkingSources(councilPoints, osmPoints) {
  const suppressedOsmIds = new Set();
  const matches = [];

  for (const councilPoint of councilPoints) {
    let bestMatch = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const osmPoint of osmPoints) {
      if (suppressedOsmIds.has(osmPoint.id)) {
        continue;
      }

      const separation = distanceMeters(councilPoint, osmPoint);
      if (
        separation < bestDistance &&
        shouldMergeCouncilAndOsm(councilPoint, osmPoint)
      ) {
        bestDistance = separation;
        bestMatch = osmPoint;
      }
    }

    if (bestMatch) {
      suppressedOsmIds.add(bestMatch.id);
      matches.push({
        councilId: councilPoint.id,
        distanceMeters: Number(bestDistance.toFixed(2)),
        osmId: bestMatch.id,
      });
    }
  }

  return {
    matches,
    points: [
      ...councilPoints,
      ...osmPoints.filter((point) => !suppressedOsmIds.has(point.id)),
    ],
    suppressedOsmIds,
  };
}

export function representativePoint(coordinates) {
  const validCoordinates = coordinates.filter(
    (coordinate) =>
      coordinate &&
      Number.isFinite(coordinate.latitude) &&
      Number.isFinite(coordinate.longitude),
  );

  if (validCoordinates.length === 0) {
    return null;
  }

  const totals = validCoordinates.reduce(
    (current, coordinate) => ({
      latitude: current.latitude + coordinate.latitude,
      longitude: current.longitude + coordinate.longitude,
    }),
    { latitude: 0, longitude: 0 },
  );

  return {
    latitude: totals.latitude / validCoordinates.length,
    longitude: totals.longitude / validCoordinates.length,
  };
}

export function normalizeOsmProperties(tags) {
  const capacity = Number(tags.capacity);
  return {
    access: tags.access ?? 'unknown',
    bicycle_pa: tags.bicycle_parking ?? '',
    capacity: Number.isFinite(capacity) && capacity > 0 ? capacity : 0,
    covered: tags.covered ?? '',
    fee: tags.fee ?? '',
    operator: tags.operator ?? '',
  };
}

export function isGenericParkingName(name) {
  if (typeof name !== 'string') {
    return true;
  }

  const normalized = name
    .trim()
    .toLowerCase()
    .replaceAll(/[._/-]+/g, ' ')
    .replaceAll(/\s+/g, ' ');

  return (
    normalized.length === 0 ||
    /^(?:cycle|bicycle|bike)(?: and scooter)? (?:parking|park|racks?|stands?|lockers?|sheds?|stores?|storage)(?: (?:area|facility|facilities))?(?: \d+)?$/.test(
      normalized,
    )
  );
}

function spatialCellKey(latitude, longitude) {
  return `${Math.floor(latitude / spatialCellSizeDegrees)}:${Math.floor(longitude / spatialCellSizeDegrees)}`;
}

function createSpatialIndex(entries) {
  const cells = new Map();
  for (const entry of entries) {
    const key = spatialCellKey(entry.latitude, entry.longitude);
    const cell = cells.get(key) ?? [];
    cell.push(entry);
    cells.set(key, cell);
  }
  return cells;
}

function nearestEntry(index, point, maximumDistance, predicate = () => true) {
  const latitudeRange = Math.ceil(
    maximumDistance / 111_000 / spatialCellSizeDegrees,
  );
  const longitudeScale = Math.max(0.2, Math.cos(toRadians(point.latitude)));
  const longitudeRange = Math.ceil(
    maximumDistance / (111_000 * longitudeScale) / spatialCellSizeDegrees,
  );
  const latitudeCell = Math.floor(point.latitude / spatialCellSizeDegrees);
  const longitudeCell = Math.floor(point.longitude / spatialCellSizeDegrees);
  let nearest = null;

  for (
    let latitudeOffset = -latitudeRange;
    latitudeOffset <= latitudeRange;
    latitudeOffset += 1
  ) {
    for (
      let longitudeOffset = -longitudeRange;
      longitudeOffset <= longitudeRange;
      longitudeOffset += 1
    ) {
      const entries =
        index.get(
          `${latitudeCell + latitudeOffset}:${longitudeCell + longitudeOffset}`,
        ) ?? [];
      for (const entry of entries) {
        if (!predicate(entry)) {
          continue;
        }
        const separation = distanceMeters(point, entry);
        if (
          separation <= maximumDistance &&
          (nearest === null ||
            separation < nearest.distance ||
            (separation === nearest.distance &&
              String(entry.name).localeCompare(String(nearest.entry.name)) < 0))
        ) {
          nearest = { distance: separation, entry };
        }
      }
    }
  }

  return nearest;
}

function withDerivedName(point, name, nameSource) {
  return {
    ...point,
    name,
    properties: { ...point.properties, nameSource },
  };
}

export function deriveParkingNames(points, context) {
  const roadIndex = createSpatialIndex(context.roads ?? []);
  const junctionIndex = createSpatialIndex(context.junctions ?? []);
  const landmarkIndex = createSpatialIndex(context.landmarks ?? []);
  const placeIndex = createSpatialIndex(context.places ?? []);
  const counts = {
    generic: 0,
    junction: 0,
    landmark: 0,
    place: 0,
    source: 0,
    street: 0,
  };

  const namedPoints = points.map((point) => {
    if (!isGenericParkingName(point.name)) {
      counts.source += 1;
      return withDerivedName(point, point.name.trim(), 'source');
    }

    const road = nearestEntry(roadIndex, point, 100);
    const junction = road
      ? nearestEntry(
          junctionIndex,
          point,
          70,
          (entry) =>
            entry.names.includes(road.entry.name) && entry.names.length > 1,
        )
      : null;
    if (road && junction) {
      const otherRoad = junction.entry.names.find(
        (name) => name !== road.entry.name,
      );
      if (otherRoad) {
        counts.junction += 1;
        return withDerivedName(
          point,
          `${road.entry.name} near ${otherRoad}`,
          'junction',
        );
      }
    }

    const landmark = nearestEntry(landmarkIndex, point, road ? 45 : 100);
    if (road && landmark) {
      counts.landmark += 1;
      return withDerivedName(
        point,
        `${road.entry.name} by ${landmark.entry.name}`,
        'landmark',
      );
    }
    if (road) {
      counts.street += 1;
      return withDerivedName(
        point,
        `${road.entry.name} cycle parking`,
        'street',
      );
    }
    if (landmark) {
      counts.landmark += 1;
      return withDerivedName(
        point,
        `${landmark.entry.name} cycle parking`,
        'landmark',
      );
    }

    const place = nearestEntry(placeIndex, point, 20_000);
    if (place) {
      counts.place += 1;
      return withDerivedName(
        point,
        `${place.entry.name} cycle parking`,
        'place',
      );
    }

    counts.generic += 1;
    return withDerivedName(point, 'Cycle parking', 'generic');
  });

  return { counts, points: namedPoints };
}
