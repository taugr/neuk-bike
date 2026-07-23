import {
  isCyclingPoiPoint,
  type CyclingPoiCategory,
  type ParkingPoint,
} from '@/lib/types';

export const savedNeuksStorageKey = 'cycle-parking-saved-neuks';

export type SavedNeukKind = 'cycling-place' | 'parking';

export type SavedNeukRecord = {
  id: string;
  key: string;
  kind: SavedNeukKind;
  savedAt: string;
  snapshot: {
    categories?: CyclingPoiCategory[];
    latitude: number;
    longitude: number;
    name: string;
    openingHours?: string;
  };
};

type SavedNeuksStorage = {
  items: SavedNeukRecord[];
  version: 2;
};

type LegacySavedNeukRecord = Omit<SavedNeukRecord, 'key' | 'kind'>;

type LegacySavedNeuksStorage = {
  items: LegacySavedNeukRecord[];
  version: 1;
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export function getSavedNeukKey(kind: SavedNeukKind, id: string) {
  return `${kind}:${id}`;
}

export function getPointSavedNeukKind(point: ParkingPoint): SavedNeukKind {
  return isCyclingPoiPoint(point) ? 'cycling-place' : 'parking';
}

export function getPointSavedNeukKey(point: ParkingPoint) {
  return getSavedNeukKey(getPointSavedNeukKind(point), point.id);
}

function hasValidSnapshot(
  candidate: Partial<SavedNeukRecord> | Partial<LegacySavedNeukRecord> | null,
) {
  const snapshot = candidate?.snapshot;

  return Boolean(
    candidate &&
    typeof candidate.id === 'string' &&
    candidate.id.length > 0 &&
    typeof candidate.savedAt === 'string' &&
    Number.isFinite(Date.parse(candidate.savedAt)) &&
    snapshot &&
    typeof snapshot.name === 'string' &&
    snapshot.name.length > 0 &&
    typeof snapshot.latitude === 'number' &&
    Number.isFinite(snapshot.latitude) &&
    snapshot.latitude >= -90 &&
    snapshot.latitude <= 90 &&
    typeof snapshot.longitude === 'number' &&
    Number.isFinite(snapshot.longitude) &&
    snapshot.longitude >= -180 &&
    snapshot.longitude <= 180,
  );
}

function isSavedNeukRecord(value: unknown): value is SavedNeukRecord {
  const candidate = value as Partial<SavedNeukRecord> | null;
  return Boolean(
    hasValidSnapshot(candidate) &&
    (candidate?.kind === 'parking' || candidate?.kind === 'cycling-place') &&
    candidate.key === getSavedNeukKey(candidate.kind, candidate.id!),
  );
}

function isLegacySavedNeukRecord(
  value: unknown,
): value is LegacySavedNeukRecord {
  return hasValidSnapshot(value as Partial<LegacySavedNeukRecord> | null);
}

export function parseSavedNeuks(value: string | null) {
  if (!value) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return [];
  }

  const storage = parsed as
    | Partial<SavedNeuksStorage>
    | Partial<LegacySavedNeuksStorage>
    | null;
  if (
    !storage ||
    (storage.version !== 1 && storage.version !== 2) ||
    !Array.isArray(storage.items)
  ) {
    return [];
  }

  const records = new Map<string, SavedNeukRecord>();
  for (const item of storage.items) {
    const record =
      storage.version === 1 && isLegacySavedNeukRecord(item)
        ? {
            ...item,
            key: getSavedNeukKey('parking', item.id),
            kind: 'parking' as const,
          }
        : isSavedNeukRecord(item)
          ? item
          : null;
    if (record && !records.has(record.key)) {
      records.set(record.key, record);
    }
  }

  return [...records.values()];
}

export function readSavedNeuks(storage: StorageLike) {
  try {
    return {
      items: parseSavedNeuks(storage.getItem(savedNeuksStorageKey)),
      ok: true as const,
    };
  } catch {
    return { items: [], ok: false as const };
  }
}

export function writeSavedNeuks(
  storage: StorageLike,
  items: SavedNeukRecord[],
) {
  try {
    storage.setItem(
      savedNeuksStorageKey,
      JSON.stringify({ items, version: 2 } satisfies SavedNeuksStorage),
    );
    return true;
  } catch {
    return false;
  }
}

export function addSavedNeuk(
  items: SavedNeukRecord[],
  point: ParkingPoint,
  savedAt = new Date().toISOString(),
) {
  const kind = getPointSavedNeukKind(point);
  const key = getSavedNeukKey(kind, point.id);
  if (items.some((item) => item.key === key)) {
    return items;
  }

  return [
    {
      id: point.id,
      key,
      kind,
      savedAt,
      snapshot: {
        ...(isCyclingPoiPoint(point)
          ? { categories: [...point.categories] }
          : {}),
        latitude: point.latitude,
        longitude: point.longitude,
        name: point.name,
        ...(typeof point.properties.openingHours === 'string'
          ? { openingHours: point.properties.openingHours }
          : {}),
      },
    },
    ...items,
  ];
}

export function removeSavedNeuk(items: SavedNeukRecord[], key: string) {
  if (!items.some((item) => item.key === key)) {
    return items;
  }

  return items.filter((item) => item.key !== key);
}

export function isNeukSaved(items: SavedNeukRecord[], point: ParkingPoint) {
  const key = getPointSavedNeukKey(point);
  return items.some((item) => item.key === key);
}

export function subscribeToSavedNeuks(
  listener: (items: SavedNeukRecord[]) => void,
) {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === savedNeuksStorageKey) {
      listener(parseSavedNeuks(event.newValue));
    }
  };

  window.addEventListener('storage', handleStorage);
  return () => window.removeEventListener('storage', handleStorage);
}
