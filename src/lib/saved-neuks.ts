import type { ParkingPoint } from '@/lib/types';

export const savedNeuksStorageKey = 'cycle-parking-saved-neuks';

export type SavedNeukRecord = {
  id: string;
  savedAt: string;
  snapshot: {
    latitude: number;
    longitude: number;
    name: string;
  };
};

type SavedNeuksStorage = {
  items: SavedNeukRecord[];
  version: 1;
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function isSavedNeukRecord(value: unknown): value is SavedNeukRecord {
  const candidate = value as Partial<SavedNeukRecord> | null;
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

  const storage = parsed as Partial<SavedNeuksStorage> | null;
  if (!storage || storage.version !== 1 || !Array.isArray(storage.items)) {
    return [];
  }

  const records = new Map<string, SavedNeukRecord>();
  for (const item of storage.items) {
    if (isSavedNeukRecord(item) && !records.has(item.id)) {
      records.set(item.id, item);
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
      JSON.stringify({ items, version: 1 } satisfies SavedNeuksStorage),
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
  if (items.some((item) => item.id === point.id)) {
    return items;
  }

  return [
    {
      id: point.id,
      savedAt,
      snapshot: {
        latitude: point.latitude,
        longitude: point.longitude,
        name: point.name,
      },
    },
    ...items,
  ];
}

export function removeSavedNeuk(items: SavedNeukRecord[], id: string) {
  if (!items.some((item) => item.id === id)) {
    return items;
  }

  return items.filter((item) => item.id !== id);
}

export function isNeukSaved(items: SavedNeukRecord[], id: string) {
  return items.some((item) => item.id === id);
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
