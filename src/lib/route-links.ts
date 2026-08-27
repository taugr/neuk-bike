import {
  CYCLESTREETS_MAX_WAYPOINTS,
  type CycleRoutePlan,
  type CycleRouteWaypoint,
} from '@/lib/cyclestreets';
import { getAppBasePath } from '@/lib/share-links';

const coordinateScale = 100_000;
const planCodes: Record<CycleRoutePlan, string> = {
  quietest: 'q',
  balanced: 'b',
  fastest: 'f',
};
const plansByCode: Record<string, CycleRoutePlan | undefined> = {
  q: 'quietest',
  b: 'balanced',
  f: 'fastest',
};

export type SharedRouteState = {
  plan: CycleRoutePlan;
  waypoints: Array<{ latitude: number; longitude: number }>;
};

function encodeCoordinate(value: number) {
  return Math.round(value * coordinateScale).toString(36);
}

function decodeCoordinate(value: string) {
  if (!/^-?[0-9a-z]+$/i.test(value)) {
    return Number.NaN;
  }
  return Number.parseInt(value, 36) / coordinateScale;
}

export function serializeRouteShareHash(
  plan: CycleRoutePlan,
  waypoints: Pick<CycleRouteWaypoint, 'latitude' | 'longitude'>[],
) {
  if (waypoints.length < 2 || waypoints.length > CYCLESTREETS_MAX_WAYPOINTS) {
    throw new Error(
      `Route links need between 2 and ${CYCLESTREETS_MAX_WAYPOINTS} stops.`,
    );
  }

  const points = waypoints.map(({ latitude, longitude }) => {
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw new Error('Route links need valid coordinates.');
    }
    return `${encodeCoordinate(latitude)}.${encodeCoordinate(longitude)}`;
  });

  return `#route=1${planCodes[plan]}~${points.join('~')}`;
}

export function parseRouteShareHash(hash: string): SharedRouteState | null {
  const match = /^#route=1([qbf])~(.+)$/.exec(hash);
  if (!match) {
    return null;
  }

  const plan = plansByCode[match[1]!];
  const encodedPoints = match[2]!.split('~');
  if (
    !plan ||
    encodedPoints.length < 2 ||
    encodedPoints.length > CYCLESTREETS_MAX_WAYPOINTS
  ) {
    return null;
  }

  const waypoints = encodedPoints.map((encodedPoint) => {
    const parts = encodedPoint.split('.');
    if (parts.length !== 2) {
      return null;
    }
    const latitude = decodeCoordinate(parts[0]!);
    const longitude = decodeCoordinate(parts[1]!);
    return Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180
      ? { latitude, longitude }
      : null;
  });

  return waypoints.every(
    (waypoint): waypoint is { latitude: number; longitude: number } =>
      waypoint !== null,
  )
    ? { plan, waypoints }
    : null;
}

export function buildRouteShareUrl(
  origin: string,
  pathname: string,
  plan: CycleRoutePlan,
  waypoints: Pick<CycleRouteWaypoint, 'latitude' | 'longitude'>[],
) {
  const appBasePath = getAppBasePath(pathname);
  const basePath = appBasePath === '/' ? '' : appBasePath;
  return `${new URL(`${basePath}/`, origin).toString()}${serializeRouteShareHash(plan, waypoints)}`;
}
