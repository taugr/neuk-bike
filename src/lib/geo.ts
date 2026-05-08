import type { ParkingPoint, UserLocation } from "@/lib/types";

export const EDINBURGH_FALLBACK_LOCATION: UserLocation = {
  latitude: 55.9533,
  longitude: -3.1883,
};

const earthRadiusMeters = 6_371_000;

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
    Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;

  return (
    2 * earthRadiusMeters * Math.atan2(Math.sqrt(halfChordLength), Math.sqrt(1 - halfChordLength))
  );
}

export function sortByDistance(points: ParkingPoint[], location: UserLocation) {
  return points
    .map((point) => ({
      ...point,
      distanceMeters: distanceMeters(location, point),
    }))
    .sort((left, right) => (left.distanceMeters ?? 0) - (right.distanceMeters ?? 0));
}

export function formatDistance(distance: number | undefined) {
  if (typeof distance !== "number") {
    return "Unknown distance";
  }

  if (distance < 1_000) {
    return `${Math.round(distance)} m`;
  }

  return `${(distance / 1_000).toFixed(1)} km`;
}
