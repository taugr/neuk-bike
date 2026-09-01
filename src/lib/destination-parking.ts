import type { CycleRoute, CycleRouteWaypoint } from '@/lib/cyclestreets';
import { distanceMeters } from '@/lib/geo';
import type { RouteDraft } from '@/lib/route-draft';
import type { ParkingPoint } from '@/lib/types';

export const DESTINATION_PARKING_PRIMARY_RADIUS_METERS = 800;
export const DESTINATION_PARKING_MAX_RADIUS_METERS = 1_500;
export const DESTINATION_PARKING_SHORTLIST_LIMIT = 6;
export const DESTINATION_PARKING_RESULT_LIMIT = 3;

export type DestinationParkingCandidate = {
  destinationDistanceMeters: number;
  route: CycleRoute | null;
  routeDurationDeltaSeconds: number | null;
  point: ParkingPoint;
};

const RESTRICTED_ACCESS_VALUES = new Set([
  'customers',
  'employees',
  'no',
  'permit',
  'private',
  'residents',
  'university',
]);

export function hasRestrictedParkingAccess(point: ParkingPoint) {
  const access = point.properties.access;
  return (
    typeof access === 'string' &&
    RESTRICTED_ACCESS_VALUES.has(access.trim().toLowerCase())
  );
}

function metadataScore(point: ParkingPoint) {
  const { access, bicycle_pa: standType, capacity, covered } = point.properties;
  const publicAccess =
    typeof access !== 'string' ||
    access === 'yes' ||
    access === 'permissive' ||
    access === 'destination';
  const knownValues = [access, standType, capacity, covered].filter(
    (value) => value !== null && value !== undefined && value !== '',
  ).length;

  return (publicAccess ? 10 : 0) + knownValues;
}

export function getDestinationParkingShortlist(
  points: ParkingPoint[],
  destination: CycleRouteWaypoint,
  limit = DESTINATION_PARKING_SHORTLIST_LIMIT,
) {
  const nearby = points
    .map((point) => ({
      ...point,
      distanceMeters: distanceMeters(destination, point),
    }))
    .filter(
      (point) => point.distanceMeters <= DESTINATION_PARKING_MAX_RADIUS_METERS,
    )
    .sort((left, right) => left.distanceMeters - right.distanceMeters);
  const primary = nearby.filter(
    (point) =>
      point.distanceMeters <= DESTINATION_PARKING_PRIMARY_RADIUS_METERS,
  );

  return (
    primary.length >= DESTINATION_PARKING_RESULT_LIMIT ? primary : nearby
  ).slice(0, limit);
}

export function rankDestinationParkingCandidates(
  candidates: DestinationParkingCandidate[],
) {
  return candidates
    .filter(({ point }) => !hasRestrictedParkingAccess(point))
    .sort((left, right) => {
      const leftRouteDelta =
        left.routeDurationDeltaSeconds ?? Number.POSITIVE_INFINITY;
      const rightRouteDelta =
        right.routeDurationDeltaSeconds ?? Number.POSITIVE_INFINITY;
      if (leftRouteDelta !== rightRouteDelta) {
        return leftRouteDelta - rightRouteDelta;
      }

      const scoreDifference =
        metadataScore(right.point) - metadataScore(left.point);
      if (scoreDifference !== 0) {
        return scoreDifference;
      }

      return left.destinationDistanceMeters - right.destinationDistanceMeters;
    })
    .slice(0, DESTINATION_PARKING_RESULT_LIMIT);
}

export function replaceRouteFinishWithParking(
  draft: RouteDraft,
  point: ParkingPoint,
): RouteDraft {
  if (draft.waypoints.length < 2) {
    return draft;
  }

  return {
    ...draft,
    waypoints: [
      ...draft.waypoints.slice(0, -1),
      {
        id: point.id,
        label: point.name,
        latitude: point.latitude,
        longitude: point.longitude,
        source: 'parking',
      },
    ],
  };
}
