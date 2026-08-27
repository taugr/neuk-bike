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
  version: 2;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  kind: 'planned' | 'imported-gpx';
  plan: CycleRoutePlan | null;
  waypoints: CycleRouteWaypoint[];
  distanceMeters: number;
  durationSeconds: number | null;
  points: CycleRoutePoint[];
  segments?: CycleRoutePoint[][];
  instructions: CycleRouteInstruction[];
  source: 'cyclestreets' | 'local' | 'gpx';
  importFileName?: string;
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
    [
      'current-location',
      'gpx',
      'map',
      'parking',
      'saved-route',
      'search',
    ].includes(waypoint.source ?? ''),
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

function isSavedRouteRecordV2(value: unknown): value is SavedRouteRecord {
  const record = value as Partial<SavedRouteRecord> | null;
  return Boolean(
    record &&
    record.version === 2 &&
    typeof record.id === 'string' &&
    record.id.length > 0 &&
    typeof record.name === 'string' &&
    record.name.trim().length > 0 &&
    typeof record.createdAt === 'string' &&
    Number.isFinite(Date.parse(record.createdAt)) &&
    typeof record.updatedAt === 'string' &&
    Number.isFinite(Date.parse(record.updatedAt)) &&
    (record.kind === 'imported-gpx'
      ? record.plan === null && record.source === 'gpx'
      : record.kind === 'planned' &&
        ['quietest', 'balanced', 'fastest'].includes(record.plan ?? '')) &&
    Array.isArray(record.waypoints) &&
    record.waypoints.length >= 2 &&
    record.waypoints.every(isWaypoint) &&
    typeof record.distanceMeters === 'number' &&
    record.distanceMeters >= 0 &&
    (record.durationSeconds === null ||
      (typeof record.durationSeconds === 'number' &&
        record.durationSeconds >= 0)) &&
    Array.isArray(record.points) &&
    record.points.length >= 2 &&
    record.points.every(isRoutePoint) &&
    (!record.segments ||
      (Array.isArray(record.segments) &&
        record.segments.length > 0 &&
        record.segments.every(
          (segment) =>
            Array.isArray(segment) &&
            segment.length >= 2 &&
            segment.every(isRoutePoint),
        ))) &&
    Array.isArray(record.instructions) &&
    ['cyclestreets', 'local', 'gpx'].includes(record.source ?? ''),
  );
}

type LegacySavedRouteRecord = Omit<
  SavedRouteRecord,
  'durationSeconds' | 'kind' | 'plan' | 'segments' | 'source' | 'version'
> & {
  version: 1;
  plan: CycleRoutePlan;
  durationSeconds: number;
  source: 'cyclestreets' | 'local';
};

function normalizeSavedRouteRecord(value: unknown): SavedRouteRecord | null {
  if (isSavedRouteRecordV2(value)) {
    return value;
  }
  const legacy = value as Partial<LegacySavedRouteRecord> | null;
  if (!legacy || legacy.version !== 1) {
    return null;
  }
  const upgraded = {
    ...legacy,
    version: 2,
    kind: 'planned',
  } as SavedRouteRecord;
  return isSavedRouteRecordV2(upgraded) ? upgraded : null;
}

export function isSavedRouteRecord(value: unknown): value is SavedRouteRecord {
  return isSavedRouteRecordV2(value);
}

export function savedRouteToCycleRoute(record: SavedRouteRecord): CycleRoute {
  return {
    plan: record.plan ?? 'balanced',
    distanceMeters: record.distanceMeters,
    durationSeconds: record.durationSeconds ?? 0,
    points: record.points,
    ...(record.segments ? { segments: record.segments } : {}),
    instructions: record.instructions,
    source: record.source === 'gpx' ? 'local' : record.source,
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
    version: 2,
    id,
    name: name.trim(),
    createdAt,
    updatedAt: createdAt,
    kind: 'planned',
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

export function createImportedGpxRouteRecord({
  id,
  name,
  fileName,
  distanceMeters,
  durationSeconds,
  points,
  segments,
  waypoints,
  createdAt = new Date().toISOString(),
}: {
  id: string;
  name: string;
  fileName: string;
  distanceMeters: number;
  durationSeconds: number | null;
  points: CycleRoutePoint[];
  segments: CycleRoutePoint[][];
  waypoints: CycleRouteWaypoint[];
  createdAt?: string;
}): SavedRouteRecord {
  return {
    version: 2,
    id,
    name: name.trim(),
    createdAt,
    updatedAt: createdAt,
    kind: 'imported-gpx',
    plan: null,
    waypoints,
    distanceMeters,
    durationSeconds,
    points,
    segments,
    instructions: [],
    source: 'gpx',
    importFileName: fileName,
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
    .map(normalizeSavedRouteRecord)
    .filter((record): record is SavedRouteRecord => record !== null)
    .sort(
      (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
    );
}

export async function getSavedRoute(id: string) {
  const value = await withStore('readonly', (store) =>
    requestResult(store.get(id)),
  );
  return normalizeSavedRouteRecord(value);
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
