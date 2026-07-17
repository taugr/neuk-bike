import type { ParkingPoint } from '@/lib/types';

export type ParkingMapBounds = {
  east: number;
  north: number;
  south: number;
  west: number;
};

export type ParkingView = 'nearby' | 'saved';

export type ParkingMarkerVariant =
  | 'default'
  | 'destination'
  | 'ranked'
  | 'ranked-saved'
  | 'saved'
  | 'selected'
  | 'selected-ranked'
  | 'selected-ranked-saved'
  | 'selected-saved';

export function getParkingMarkerVariant({
  isDirectionsMode,
  isSaved,
  isSelected,
  parkingView,
  rank,
}: {
  isDirectionsMode: boolean;
  isSaved: boolean;
  isSelected: boolean;
  parkingView: ParkingView;
  rank: number | undefined;
}): ParkingMarkerVariant {
  if (isSelected && isDirectionsMode) {
    return 'destination';
  }

  if (parkingView === 'saved') {
    return isSelected ? 'selected-saved' : 'saved';
  }

  if (isSelected && rank !== undefined) {
    return isSaved ? 'selected-ranked-saved' : 'selected-ranked';
  }

  if (isSelected) {
    return isSaved ? 'selected-saved' : 'selected';
  }

  if (rank !== undefined) {
    return isSaved ? 'ranked-saved' : 'ranked';
  }

  return isSaved ? 'saved' : 'default';
}

type RenderableParkingPointsOptions = {
  bounds: ParkingMapBounds | null;
  pinnedPoints?: ParkingPoint[];
  points: ParkingPoint[];
  selectedPoint?: ParkingPoint | null;
  zoom: number;
};

const allPointZoom = 16;
const defaultPinnedPointCount = 8;

function getSafetyRenderablePointCount(zoom: number) {
  if (zoom >= allPointZoom) {
    return Number.POSITIVE_INFINITY;
  }

  if (zoom >= 15) {
    return 420;
  }

  if (zoom >= 14) {
    return 300;
  }

  if (zoom >= 13) {
    return 220;
  }

  if (zoom >= 12) {
    return 160;
  }

  return 80;
}

function containsPoint(bounds: ParkingMapBounds, point: ParkingPoint) {
  return (
    point.latitude >= bounds.south &&
    point.latitude <= bounds.north &&
    point.longitude >= bounds.west &&
    point.longitude <= bounds.east
  );
}

function getBoundsPaddingRatio(zoom: number) {
  if (zoom >= allPointZoom) {
    return 1;
  }

  if (zoom >= 16) {
    return 0.75;
  }

  if (zoom >= 15) {
    return 0.5;
  }

  return 0;
}

function getPaddedBounds(bounds: ParkingMapBounds, zoom: number) {
  const paddingRatio = getBoundsPaddingRatio(zoom);

  if (paddingRatio === 0) {
    return bounds;
  }

  const latitudePadding = (bounds.north - bounds.south) * paddingRatio;
  const longitudePadding = (bounds.east - bounds.west) * paddingRatio;

  return {
    east: bounds.east + longitudePadding,
    north: bounds.north + latitudePadding,
    south: bounds.south - latitudePadding,
    west: bounds.west - longitudePadding,
  };
}

function getCellSizeDegrees(zoom: number) {
  if (zoom >= allPointZoom) {
    return 0;
  }

  if (zoom >= 15) {
    return 0.0012;
  }

  if (zoom >= 14) {
    return 0.0025;
  }

  if (zoom >= 13) {
    return 0.007;
  }

  if (zoom >= 12) {
    return 0.012;
  }

  return 0.02;
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
  const candidateBounds = bounds ? getPaddedBounds(bounds, zoom) : null;
  const candidatePoints = candidateBounds
    ? points.filter((point) => containsPoint(candidateBounds, point))
    : points;

  if (zoom >= allPointZoom) {
    for (const point of candidatePoints) {
      addUniquePoint(renderablePoints, point);
    }
  } else {
    const cellSizeDegrees = getCellSizeDegrees(zoom);
    const safetyRenderablePointCount = getSafetyRenderablePointCount(zoom);
    const occupiedCells = new Set<string>();

    for (const point of candidatePoints) {
      if (renderablePoints.size >= safetyRenderablePointCount) {
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
