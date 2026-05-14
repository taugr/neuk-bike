import { isResolvedLocation } from "@/lib/geo";
import type { ParkingPoint, UserLocation } from "@/lib/types";

function getAppBasePath(pathname: string) {
  const parkingSegment = "/parking/";
  const parkingSegmentIndex = pathname.indexOf(parkingSegment);

  if (parkingSegmentIndex >= 0) {
    return pathname.slice(0, parkingSegmentIndex) || "/";
  }

  return pathname.endsWith("/") && pathname.length > 1 ? pathname.slice(0, -1) : pathname;
}

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
  const appBasePath = getAppBasePath(pathname);
  const basePath = appBasePath === "/" ? "" : appBasePath;
  const url = new URL(`${basePath}/parking/${encodeURIComponent(parkingId)}/`, origin);

  return url.toString();
}
