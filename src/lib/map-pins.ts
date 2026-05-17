import type { ParkingPoint } from '@/lib/types';

export type ParkingMapBounds = {
  east: number;
  north: number;
  south: number;
  west: number;
};

type RenderableParkingPointsOptions = {
  bounds: ParkingMapBounds | null;
  pinnedPoints?: ParkingPoint[];
  points: ParkingPoint[];
  selectedPoint?: ParkingPoint | null;
  zoom: number;
};

const allPointZoom = 17;
const defaultPinnedPointCount = 8;

function getMaxRenderablePointCount(zoom: number) {
  if (zoom >= allPointZoom) {
    return Number.POSITIVE_INFINITY;
  }

  if (zoom >= 16) {
    return 80;
  }

  if (zoom >= 15) {
    return 48;
  }

  if (zoom >= 14) {
    return 32;
  }

  if (zoom >= 12) {
    return 24;
  }

  return 12;
}

function containsPoint(bounds: ParkingMapBounds, point: ParkingPoint) {
  return (
    point.latitude >= bounds.south &&
    point.latitude <= bounds.north &&
    point.longitude >= bounds.west &&
    point.longitude <= bounds.east
  );
}

function getCellSizeDegrees(zoom: number) {
  if (zoom >= allPointZoom) {
    return 0;
  }

  if (zoom >= 16) {
    return 0.0008;
  }

  if (zoom >= 15) {
    return 0.001;
  }

  if (zoom >= 14) {
    return 0.0016;
  }

  if (zoom >= 13) {
    return 0.0025;
  }

  if (zoom >= 12) {
    return 0.004;
  }

  return 0.008;
}

function getGridKey(point: ParkingPoint, cellSizeDegrees: number) {
  const latitudeCell = Math.floor(point.latitude / cellSizeDegrees);
  const longitudeCell = Math.floor(point.longitude / cellSizeDegrees);

  return `${latitudeCell}:${longitudeCell}`;
}

function addUniquePoint(
  pointsById: Map<string, ParkingPoint>,
  point: ParkingPoint,
) {
  pointsById.set(point.id, point);
}

export function getRenderableParkingPoints({
  bounds,
  pinnedPoints,
  points,
  selectedPoint,
  zoom,
}: RenderableParkingPointsOptions) {
  const renderablePoints = new Map<string, ParkingPoint>();
  const visiblePoints = bounds
    ? points.filter((point) => containsPoint(bounds, point))
    : points;

  if (zoom >= allPointZoom) {
    for (const point of visiblePoints) {
      addUniquePoint(renderablePoints, point);
    }
  } else {
    const cellSizeDegrees = getCellSizeDegrees(zoom);
    const maxRenderablePointCount = getMaxRenderablePointCount(zoom);
    const occupiedCells = new Set<string>();

    for (const point of visiblePoints) {
      if (renderablePoints.size >= maxRenderablePointCount) {
        break;
      }

      const gridKey = getGridKey(point, cellSizeDegrees);

      if (occupiedCells.has(gridKey)) {
        continue;
      }

      occupiedCells.add(gridKey);
      addUniquePoint(renderablePoints, point);
    }
  }

  for (const point of (
    pinnedPoints ?? points.slice(0, defaultPinnedPointCount)
  ).slice(0, defaultPinnedPointCount)) {
    addUniquePoint(renderablePoints, point);
  }

  if (selectedPoint) {
    addUniquePoint(renderablePoints, selectedPoint);
  }

  return Array.from(renderablePoints.values());
}
