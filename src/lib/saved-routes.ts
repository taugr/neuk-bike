import type {
  CycleRoute,
  CycleRouteInstruction,
  CycleRoutePlan,
  CycleRoutePoint,
  CycleRouteWaypoint,
} from '@/lib/cyclestreets';
import { distanceMeters } from '@/lib/geo';

const databaseName = 'bike-neuks';
const databaseVersion = 1;
const storeName = 'saved-routes';

export type SavedRouteRecord = {
  version: 1;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  plan: CycleRoutePlan;
  waypoints: CycleRouteWaypoint[];
  distanceMeters: number;
  durationSeconds: number;
  points: CycleRoutePoint[];
  instructions: CycleRouteInstruction[];
  source: 'cyclestreets' | 'local';
  providerItineraryId?: string;
  providerRouteUrl?: string;
};

function isFiniteCoordinate(value: unknown, min: number, max: number) {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
  );
}

function isWaypoint(value: unknown): value is CycleRouteWaypoint {
  const waypoint = value as Partial<CycleRouteWaypoint> | null;
  return Boolean(
    waypoint &&
    typeof waypoint.id === 'string' &&
    typeof waypoint.label === 'string' &&
    isFiniteCoordinate(waypoint.latitude, -90, 90) &&
    isFiniteCoordinate(waypoint.longitude, -180, 180) &&
    ['current-location', 'map', 'parking', 'saved-route', 'search'].includes(
      waypoint.source ?? '',
    ),
  );
}

function isRoutePoint(value: unknown): value is CycleRoutePoint {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    isFiniteCoordinate(value[0], -90, 90) &&
    isFiniteCoordinate(value[1], -180, 180)
  );
}

export function isSavedRouteRecord(value: unknown): value is SavedRouteRecord {
  const record = value as Partial<SavedRouteRecord> | null;
  return Boolean(
    record &&
    record.version === 1 &&
    typeof record.id === 'string' &&
    record.id.length > 0 &&
    typeof record.name === 'string' &&
    record.name.trim().length > 0 &&
    typeof record.createdAt === 'string' &&
    Number.isFinite(Date.parse(record.createdAt)) &&
    typeof record.updatedAt === 'string' &&
    Number.isFinite(Date.parse(record.updatedAt)) &&
    ['quietest', 'balanced', 'fastest'].includes(record.plan ?? '') &&
    Array.isArray(record.waypoints) &&
    record.waypoints.length >= 2 &&
    record.waypoints.every(isWaypoint) &&
    typeof record.distanceMeters === 'number' &&
    record.distanceMeters >= 0 &&
    typeof record.durationSeconds === 'number' &&
    record.durationSeconds >= 0 &&
    Array.isArray(record.points) &&
    record.points.length >= 2 &&
    record.points.every(isRoutePoint) &&
    Array.isArray(record.instructions) &&
    (record.source === 'cyclestreets' || record.source === 'local'),
  );
}

export function savedRouteToCycleRoute(record: SavedRouteRecord): CycleRoute {
  return {
    plan: record.plan,
    distanceMeters: record.distanceMeters,
    durationSeconds: record.durationSeconds,
    points: record.points,
    instructions: record.instructions,
    source: record.source,
    ...(record.providerItineraryId
      ? { itineraryId: record.providerItineraryId }
      : {}),
    ...(record.providerRouteUrl ? { routeUrl: record.providerRouteUrl } : {}),
  };
}

export function groupRouteWaypointNumbersByInstruction(
  waypoints: CycleRouteWaypoint[],
  instructions: CycleRouteInstruction[],
) {
  const waypointNumbersByInstruction = instructions.map(() => [] as number[]);
  if (waypoints.length === 0 || instructions.length === 0) {
    return waypointNumbersByInstruction;
  }

  const lastInstructionIndex = instructions.length - 1;
  let minimumInstructionIndex = 0;

  waypoints.forEach((waypoint, waypointIndex) => {
    let instructionIndex = minimumInstructionIndex;

    if (waypointIndex === 0) {
      instructionIndex = 0;
    } else if (waypointIndex === waypoints.length - 1) {
      instructionIndex = lastInstructionIndex;
    } else {
      let closestDistance = Number.POSITIVE_INFINITY;
      for (
        let candidateIndex = minimumInstructionIndex;
        candidateIndex <= lastInstructionIndex;
        candidateIndex += 1
      ) {
        const [latitude, longitude] = instructions[candidateIndex]!.anchor;
        const candidateDistance = distanceMeters(waypoint, {
          latitude,
          longitude,
        });
        if (candidateDistance < closestDistance) {
          closestDistance = candidateDistance;
          instructionIndex = candidateIndex;
        }
      }
    }

    waypointNumbersByInstruction[instructionIndex]!.push(waypointIndex + 1);
    minimumInstructionIndex = instructionIndex;
  });

  return waypointNumbersByInstruction;
}

export function createSavedRouteRecord({
  id,
  name,
  route,
  waypoints,
  createdAt = new Date().toISOString(),
}: {
  id: string;
  name: string;
  route: CycleRoute;
  waypoints: CycleRouteWaypoint[];
  createdAt?: string;
}): SavedRouteRecord {
  return {
    version: 1,
    id,
    name: name.trim(),
    createdAt,
    updatedAt: createdAt,
    plan: route.plan,
    waypoints,
    distanceMeters: route.distanceMeters,
    durationSeconds: route.durationSeconds,
    points: route.points,
    instructions: route.instructions,
    source: route.source,
    ...(route.itineraryId ? { providerItineraryId: route.itineraryId } : {}),
    ...(route.routeUrl ? { providerRouteUrl: route.routeUrl } : {}),
  };
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('Route storage failed.'));
  });
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Route storage is unavailable.'));
      return;
    }

    const request = indexedDB.open(databaseName, databaseVersion);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(storeName)) {
        database.createObjectStore(storeName, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('Route storage failed.'));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => Promise<T>,
) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(storeName, mode);
    return await operation(transaction.objectStore(storeName));
  } finally {
    database.close();
  }
}

export async function listSavedRoutes() {
  const values = await withStore('readonly', (store) =>
    requestResult(store.getAll()),
  );
  return values
    .filter(isSavedRouteRecord)
    .sort(
      (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
    );
}

export async function getSavedRoute(id: string) {
  const value = await withStore('readonly', (store) =>
    requestResult(store.get(id)),
  );
  return isSavedRouteRecord(value) ? value : null;
}

export async function putSavedRoute(record: SavedRouteRecord) {
  if (!isSavedRouteRecord(record)) {
    throw new Error('The route cannot be saved.');
  }
  await withStore('readwrite', (store) => requestResult(store.put(record)));
  return record;
}

export async function deleteSavedRoute(id: string) {
  await withStore('readwrite', (store) => requestResult(store.delete(id)));
}
