import type { ParkingPoint, UserLocation } from "@/lib/types";

export const CYCLESTREETS_DIRECTIONS_ENDPOINT = "https://api.cyclestreets.net/v2/journey.plan";
export const CYCLESTREETS_ROUTE_PLAN = "balanced";
export const CYCLESTREETS_SPEED_KMPH = "16";

export type CycleRoutePoint = [latitude: number, longitude: number];

export type CycleRouteInstruction = {
  id: string;
  streetName: string;
  turn: string;
  distanceMeters: number;
  durationSeconds: number;
  travelMode: string;
};

export type CycleRoute = {
  plan: typeof CYCLESTREETS_ROUTE_PLAN;
  distanceMeters: number;
  durationSeconds: number;
  points: CycleRoutePoint[];
  instructions: CycleRouteInstruction[];
  itineraryId?: string;
  routeUrl?: string;
};

type CycleStreetsDirectionsRequest = {
  url: string;
  headers: Record<string, string>;
};

type GeoJsonGeometry = {
  type?: unknown;
  coordinates?: unknown;
};

type GeoJsonFeature = {
  type?: unknown;
  properties?: unknown;
  geometry?: GeoJsonGeometry;
};

type GeoJsonFeatureCollection = {
  type?: unknown;
  properties?: unknown;
  features?: unknown;
};

type CycleStreetsProperties = Record<string, unknown>;

let jsonpRequestCount = 0;

export class CycleStreetsRouteError extends Error {
  constructor(message = "Directions are unavailable right now.") {
    super(message);
    this.name = "CycleStreetsRouteError";
  }
}

function formatWaypoint(location: UserLocation, name?: string) {
  const waypoint = `${location.longitude.toFixed(5)},${location.latitude.toFixed(5)}`;
  return name ? `${waypoint},${name}` : waypoint;
}

export function buildCycleStreetsDirectionsRequest({
  apiKey,
  origin,
  destination,
}: {
  apiKey: string;
  origin: UserLocation;
  destination: ParkingPoint;
}): CycleStreetsDirectionsRequest {
  const params = new URLSearchParams({
    key: apiKey,
    plans: CYCLESTREETS_ROUTE_PLAN,
    speedKmph: CYCLESTREETS_SPEED_KMPH,
    archive: "none",
    itineraryFields: "start,finish,id",
    journeyFields: "path,plan,lengthMetres,timeSeconds",
    waypoints: `${formatWaypoint(origin, "Start")}|${formatWaypoint(destination, destination.name)}`,
  });

  return {
    url: `${CYCLESTREETS_DIRECTIONS_ENDPOINT}?${params.toString()}`,
    headers: {
      Accept: "application/json",
    },
  };
}

function fetchCycleStreetsJsonp(url: string) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(new CycleStreetsRouteError());
  }

  return new Promise<unknown>((resolve, reject) => {
    const callbackName = `__cycleStreetsDirections${Date.now()}${jsonpRequestCount}`;
    jsonpRequestCount += 1;

    const callbackTarget = window as unknown as Window &
      Record<string, ((response: unknown) => void) | undefined>;
    const script = document.createElement("script");
    const jsonpUrl = new URL(url);
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new CycleStreetsRouteError());
    }, 15_000);

    function cleanup() {
      window.clearTimeout(timeoutId);
      delete callbackTarget[callbackName];
      script.remove();
    }

    callbackTarget[callbackName] = (response: unknown) => {
      cleanup();
      resolve(response);
    };

    jsonpUrl.searchParams.set("callback", callbackName);
    script.src = jsonpUrl.toString();
    script.async = true;
    script.onerror = () => {
      cleanup();
      reject(new CycleStreetsRouteError());
    };

    document.head.append(script);
  });
}

export async function fetchCycleStreetsDirections(request: CycleStreetsDirectionsRequest) {
  if (typeof window !== "undefined" && typeof document !== "undefined") {
    return fetchCycleStreetsJsonp(request.url);
  }

  const response = await fetch(request.url, {
    headers: request.headers,
  });

  if (!response.ok) {
    throw new CycleStreetsRouteError();
  }

  return response.json();
}

export function buildCycleRouteCacheKey(origin: UserLocation, destination: ParkingPoint) {
  return [
    CYCLESTREETS_ROUTE_PLAN,
    origin.latitude.toFixed(5),
    origin.longitude.toFixed(5),
    destination.id,
    destination.latitude.toFixed(5),
    destination.longitude.toFixed(5),
  ].join(":");
}

export function formatCycleRouteDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "less than 1 min";
  }

  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes === 1 ? "1 min" : `${minutes} min`;
}

export function describeCycleRouteInstruction(instruction: CycleRouteInstruction) {
  const name = instruction.streetName.trim();
  const turn = instruction.turn.trim();

  if (turn === "start") {
    return name ? `Start on ${name}` : "Start";
  }

  if (!name) {
    return turn;
  }

  return `${turn} onto ${name}`;
}

function getObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function getString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function getStringOrNumber(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}

function parseLineString(geometry: GeoJsonGeometry | undefined): CycleRoutePoint[] {
  if (geometry?.type !== "LineString" || !Array.isArray(geometry.coordinates)) {
    return [];
  }

  return geometry.coordinates.flatMap((coordinate) => {
    if (!Array.isArray(coordinate) || coordinate.length < 2) {
      return [];
    }

    const longitude = getNumber(coordinate[0]);
    const latitude = getNumber(coordinate[1]);

    if (latitude === null || longitude === null) {
      return [];
    }

    return [[latitude, longitude] satisfies CycleRoutePoint];
  });
}

function isFeature(value: unknown): value is GeoJsonFeature {
  return getObject(value)?.type === "Feature";
}

function getFeatureProperties(feature: GeoJsonFeature): CycleStreetsProperties {
  return getObject(feature.properties) ?? {};
}

function getPath(properties: CycleStreetsProperties) {
  return getString(properties.path) ?? "";
}

function parseRouteUrl(properties: CycleStreetsProperties) {
  const itineraryId = getStringOrNumber(properties.id) ?? getStringOrNumber(properties.itinerary);

  if (!itineraryId) {
    return {};
  }

  return {
    itineraryId,
    routeUrl: `https://www.cyclestreets.net/journey/${itineraryId}/`,
  };
}

export function parseCycleStreetsRoute(response: unknown): CycleRoute {
  const errorMessage = getString(getObject(response)?.error);
  if (errorMessage) {
    throw new CycleStreetsRouteError(errorMessage);
  }

  const collection = getObject(response) as GeoJsonFeatureCollection | null;
  if (collection?.type !== "FeatureCollection" || !Array.isArray(collection.features)) {
    throw new CycleStreetsRouteError("CycleStreets returned an unexpected route response.");
  }

  const features = collection.features.filter(isFeature);
  const routeFeature = features.find((feature) => {
    const properties = getFeatureProperties(feature);
    return getPath(properties) === `plan/${CYCLESTREETS_ROUTE_PLAN}`;
  });

  if (!routeFeature) {
    throw new CycleStreetsRouteError("CycleStreets did not return a usable route.");
  }

  const routeProperties = getFeatureProperties(routeFeature);
  const distanceMeters = getNumber(routeProperties.lengthMetres);
  const durationSeconds = getNumber(routeProperties.timeSeconds);
  const points = parseLineString(routeFeature.geometry);

  if (distanceMeters === null || durationSeconds === null || points.length < 2) {
    throw new CycleStreetsRouteError("CycleStreets returned an incomplete route.");
  }

  const instructions = features
    .filter((feature) =>
      getPath(getFeatureProperties(feature)).startsWith(`plan/${CYCLESTREETS_ROUTE_PLAN}/street/`),
    )
    .map((feature, index): CycleRouteInstruction | null => {
      const properties = getFeatureProperties(feature);
      const streetName = getString(properties.name) ?? "";
      const turn = getString(properties.turnPrevText) ?? "";
      const streetDistanceMeters = getNumber(properties.lengthMetres);
      const streetDurationSeconds = getNumber(properties.timeSeconds);
      const travelMode = getString(properties.travelMode) ?? "cycling";

      if (streetDistanceMeters === null || streetDurationSeconds === null) {
        return null;
      }

      return {
        id: getPath(properties) || `instruction-${index}`,
        streetName,
        turn,
        distanceMeters: streetDistanceMeters,
        durationSeconds: streetDurationSeconds,
        travelMode,
      };
    })
    .filter((instruction): instruction is CycleRouteInstruction => instruction !== null);

  return {
    plan: CYCLESTREETS_ROUTE_PLAN,
    distanceMeters,
    durationSeconds,
    points,
    instructions,
    ...parseRouteUrl(routeProperties),
  };
}
