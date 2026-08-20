import type { ParkingPoint } from '@/lib/types';

export const parkingSortModes = ['nearest', 'best-match'] as const;
export type ParkingSortMode = (typeof parkingSortModes)[number];

export type ParkingFilters = {
  cargoBike: boolean;
  covered: boolean;
  frameLockable: boolean;
  minimumCapacity: number;
  publicAccess: boolean;
};

export const defaultParkingFilters: ParkingFilters = {
  cargoBike: false,
  covered: false,
  frameLockable: false,
  minimumCapacity: 0,
  publicAccess: false,
};

export const parkingCapacitySteps = [0, 2, 4, 6, 10, 20] as const;

type ParkingCriterionStatus = 'fail' | 'match' | 'unknown';

export type ParkingFilterEvaluation = {
  failCount: number;
  matchCount: number;
  unknownCount: number;
};

export type ParkingFilterResultSummary = {
  completeMatchCount: number;
  eligibleCount: number;
  unknownMatchCount: number;
};

const frameLockableTypes = new Set([
  'arcadia',
  'bollard',
  'crossbar',
  'hoop',
  'lean_and_stick',
  'post_hoop',
  'rope',
  'safe_loops',
  'smart_frame_lock',
  'stands',
  'staple',
  'streetpod',
  'wide_stands',
]);

const knownNonFrameLockableTypes = new Set([
  'floor',
  'front_wheel',
  'front_wheel_only',
  'ground_slots',
  'rack',
  'racks',
  'wall_loops',
]);

function normalizedString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim().toLowerCase()
    : null;
}

function coveredStatus(point: ParkingPoint): ParkingCriterionStatus {
  const covered = normalizedString(point.properties.covered);
  if (covered === 'yes') return 'match';
  if (covered === 'no') return 'fail';
  return 'unknown';
}

function publicAccessStatus(point: ParkingPoint): ParkingCriterionStatus {
  const access = normalizedString(point.properties.access);
  if (access === 'yes' || access === 'permissive') return 'match';
  if (access === null || access === 'unknown') return 'unknown';
  return 'fail';
}

function capacityStatus(
  point: ParkingPoint,
  minimumCapacity: number,
): ParkingCriterionStatus {
  const capacity = point.properties.capacity;
  if (typeof capacity !== 'number' || capacity <= 0) return 'unknown';
  return capacity >= minimumCapacity ? 'match' : 'fail';
}

function frameLockableStatus(point: ParkingPoint): ParkingCriterionStatus {
  const type = normalizedString(point.properties.bicycle_pa);
  if (type === null) return 'unknown';
  if (frameLockableTypes.has(type)) return 'match';
  if (knownNonFrameLockableTypes.has(type)) return 'fail';
  return 'unknown';
}

function cargoBikeStatus(point: ParkingPoint): ParkingCriterionStatus {
  const cargoCapacity = point.properties.capacity_cargo_bike;
  if (typeof cargoCapacity === 'number' && cargoCapacity > 0) return 'match';

  const cargoBike = normalizedString(point.properties.cargo_bike);
  if (cargoBike === 'yes' || cargoBike === 'designated') return 'match';
  if (cargoBike === 'no') return 'fail';
  return 'unknown';
}

export function countActiveParkingFilters(filters: ParkingFilters) {
  return (
    Number(filters.covered) +
    Number(filters.publicAccess) +
    Number(filters.minimumCapacity > 0) +
    Number(filters.frameLockable) +
    Number(filters.cargoBike)
  );
}

export function hasActiveParkingFilters(filters: ParkingFilters) {
  return countActiveParkingFilters(filters) > 0;
}

export function evaluateParkingFilters(
  point: ParkingPoint,
  filters: ParkingFilters,
): ParkingFilterEvaluation {
  const statuses: ParkingCriterionStatus[] = [];
  if (filters.covered) statuses.push(coveredStatus(point));
  if (filters.publicAccess) statuses.push(publicAccessStatus(point));
  if (filters.minimumCapacity > 0) {
    statuses.push(capacityStatus(point, filters.minimumCapacity));
  }
  if (filters.frameLockable) statuses.push(frameLockableStatus(point));
  if (filters.cargoBike) statuses.push(cargoBikeStatus(point));

  return statuses.reduce<ParkingFilterEvaluation>(
    (result, status) => ({
      failCount: result.failCount + Number(status === 'fail'),
      matchCount: result.matchCount + Number(status === 'match'),
      unknownCount: result.unknownCount + Number(status === 'unknown'),
    }),
    { failCount: 0, matchCount: 0, unknownCount: 0 },
  );
}

function compareDistance(left: ParkingPoint, right: ParkingPoint) {
  const distanceDifference =
    (left.distanceMeters ?? Number.POSITIVE_INFINITY) -
    (right.distanceMeters ?? Number.POSITIVE_INFINITY);
  if (distanceDifference !== 0) return distanceDifference;
  return left.name.localeCompare(right.name);
}

export function filterAndSortParkingPoints<T extends ParkingPoint>(
  points: T[],
  filters: ParkingFilters,
  sortMode: ParkingSortMode,
): T[] {
  const evaluations = new Map<string, ParkingFilterEvaluation>();
  const eligible = points.filter((point) => {
    const evaluation = evaluateParkingFilters(point, filters);
    evaluations.set(point.id, evaluation);
    return evaluation.failCount === 0;
  });

  if (sortMode === 'nearest' || !hasActiveParkingFilters(filters)) {
    return eligible.sort(compareDistance);
  }

  return eligible.sort((left, right) => {
    const leftEvaluation = evaluations.get(left.id)!;
    const rightEvaluation = evaluations.get(right.id)!;
    const unknownDifference =
      leftEvaluation.unknownCount - rightEvaluation.unknownCount;
    if (unknownDifference !== 0) return unknownDifference;

    const matchDifference =
      rightEvaluation.matchCount - leftEvaluation.matchCount;
    if (matchDifference !== 0) return matchDifference;

    return compareDistance(left, right);
  });
}

export function summarizeParkingFilterResults(
  points: ParkingPoint[],
  filters: ParkingFilters,
): ParkingFilterResultSummary {
  let completeMatchCount = 0;
  let unknownMatchCount = 0;

  for (const point of points) {
    const evaluation = evaluateParkingFilters(point, filters);
    if (evaluation.failCount > 0) continue;
    if (evaluation.unknownCount > 0) unknownMatchCount += 1;
    else completeMatchCount += 1;
  }

  return {
    completeMatchCount,
    eligibleCount: completeMatchCount + unknownMatchCount,
    unknownMatchCount,
  };
}
