import { isResolvedLocation } from "@/lib/geo";
import type { ParkingPoint, UserLocation } from "@/lib/types";

export function parseUrlParkingId(search: string) {
  const parkingId = new URLSearchParams(search).get("parking")?.trim();
  return parkingId && parkingId.length > 0 ? parkingId : null;
}

export function parseUrlLocation(search: string): UserLocation | null {
  const params = new URLSearchParams(search);
  const location = {
    latitude: Number(params.get("lat")),
    longitude: Number(params.get("lng")),
  };

  return isResolvedLocation(location) ? location : null;
}

export function findSharedParkingPoint(search: string, points: ParkingPoint[]) {
  const parkingId = parseUrlParkingId(search);
  return parkingId ? (points.find((point) => point.id === parkingId) ?? null) : null;
}

export function parseShareLinkState(search: string, points: ParkingPoint[]) {
  return {
    selectedParkingId: findSharedParkingPoint(search, points)?.id ?? null,
    referenceLocation: parseUrlLocation(search),
  };
}

export function buildParkingShareUrl(origin: string, pathname: string, parkingId: string) {
  const url = new URL(pathname, origin);
  url.searchParams.set("parking", parkingId);
  return url.toString();
}
