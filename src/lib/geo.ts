import type { ParkingPoint, UserLocation } from '@/lib/types';

export const EDINBURGH_FALLBACK_LOCATION: UserLocation = {
  latitude: 55.9533,
  longitude: -3.1883,
};

export const FAR_FROM_EDINBURGH_THRESHOLD_METERS = 50_000;

const nullIslandThresholdDegrees = 0.0001;
const earthRadiusMeters = 6_371_000;

export function isResolvedLocation(location: UserLocation) {
  if (
    !Number.isFinite(location.latitude) ||
    !Number.isFinite(location.longitude) ||
    location.latitude < -90 ||
    location.latitude > 90 ||
    location.longitude < -180 ||
    location.longitude > 180
  ) {
    return false;
  }

  return (
    Math.abs(location.latitude) > nullIslandThresholdDegrees ||
    Math.abs(location.longitude) > nullIslandThresholdDegrees
  );
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function distanceMeters(from: UserLocation, to: UserLocation) {
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

export function sortByDistance(points: ParkingPoint[], location: UserLocation) {
  return points
    .map((point) => ({
      ...point,
      distanceMeters: distanceMeters(location, point),
    }))
    .sort(
      (left, right) => (left.distanceMeters ?? 0) - (right.distanceMeters ?? 0),
    );
}

export function isFarFromNearestParking(
  points: ParkingPoint[],
  location: UserLocation,
  thresholdMeters = FAR_FROM_EDINBURGH_THRESHOLD_METERS,
) {
  const nearestDistance = sortByDistance(points, location)[0]?.distanceMeters;

  return (
    typeof nearestDistance !== 'number' || nearestDistance > thresholdMeters
  );
}

export function formatDistance(distance: number | undefined) {
  if (typeof distance !== 'number') {
    return 'Unknown distance';
  }

  if (distance < 1_000) {
    return `${Math.round(distance)} m`;
  }

  return `${(distance / 1_000).toFixed(1)} km`;
}
