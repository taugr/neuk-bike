import type { ParkingDataManifest } from '@/lib/types';

export const offlineAreaCacheName = 'neuk-bike-offline-areas-v1';
export const maximumOfflineAreas = 5;
export const maximumOfflineAreaBytes = 100 * 1024 * 1024;
export const maximumOfflineAreasBytes = 500 * 1024 * 1024;
export const offlineStorageHeadroomRatio = 0.2;
export const offlineAreaUpdateRecommendedDays = 30;
export const offlineAreaStaleDays = 90;

const databaseName = 'neuk-bike-offline-areas';
const databaseVersion = 1;
const areaStoreName = 'areas';
const fallbackBytesPerPoint = 400;
const minimumFallbackBytes = 1_024;
const manifestByteLengths = new WeakMap<object, number>();

type ManifestChunk = {
  byteLength?: number;
  count: number;
  path: string;
};

type OfflineManifest = Pick<ParkingDataManifest, 'refreshedAt'> & {
  chunks: Record<string, ManifestChunk>;
  pointIndexPath?: string;
};

type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type OfflineAreaResource = {
  byteLength: number;
  key: string;
  url: string;
};

export type OfflineAreaPlan = {
  datasets: OfflineAreaDatasetSummary[];
  estimatedBytes: number;
  manifestRefreshedAt: string;
  resources: OfflineAreaResource[];
};

export type OfflineAreaDatasetSummary = {
  id: string;
  refreshedAt: string;
};

export type OfflineAreaBounds = {
  east: number;
  north: number;
  south: number;
  west: number;
};

export type OfflineAreaCenter = {
  latitude: number;
  longitude: number;
};

export type OfflineAreaDownloadMetadata = {
  bounds: OfflineAreaBounds;
  center: OfflineAreaCenter;
  datasets?: OfflineAreaDatasetSummary[];
};

export type OfflineAreaStatus = 'downloading' | 'complete';

export type OfflineAreaRecord = {
  actualBytes?: number;
  // Optional so records written before area metadata was introduced remain valid.
  bounds?: OfflineAreaBounds;
  center?: OfflineAreaCenter;
  createdAt: string;
  datasets?: OfflineAreaDatasetSummary[];
  estimatedBytes: number;
  id: string;
  manifestRefreshedAt: string;
  name: string;
  resourceUrls: string[];
  status: OfflineAreaStatus;
  updatedAt: string;
};

export type OfflineStorageEstimate = {
  quota?: number;
  usage?: number;
};

export type OfflineAreaStore = {
  delete(id: string): Promise<void>;
  get(id: string): Promise<OfflineAreaRecord | undefined>;
  list(): Promise<OfflineAreaRecord[]>;
  put(record: OfflineAreaRecord): Promise<void>;
};

export type OfflineAreaCache = {
  delete(request: RequestInfo | URL): Promise<boolean>;
  match(request: RequestInfo | URL): Promise<Response | undefined>;
  put(request: RequestInfo | URL, response: Response): Promise<void>;
};

export type OfflineAreaDownloadProgress = {
  completedBytes: number;
  completedResources: number;
  totalBytes: number;
  totalResources: number;
};

export type DownloadOfflineAreaOptions = {
  cache?: OfflineAreaCache;
  concurrency?: number;
  fetcher?: Fetcher;
  metadata?: OfflineAreaDownloadMetadata;
  minimumRequestIntervalMs?: number;
  maximumRetries?: number;
  onProgress?: (progress: OfflineAreaDownloadProgress) => void;
  signal?: AbortSignal;
  store?: OfflineAreaStore;
};

export type OfflineAreaFreshness = 'fresh' | 'update-recommended' | 'stale';

export type DownloadOfflineAreaResult = {
  record: OfflineAreaRecord;
  resumed: boolean;
};

function now() {
  return new Date().toISOString();
}

export function getOfflineAreaFreshness(
  area: Pick<OfflineAreaRecord, 'updatedAt'>,
  currentTime = Date.now(),
): OfflineAreaFreshness {
  const updatedAt = new Date(area.updatedAt).getTime();
  if (!Number.isFinite(updatedAt)) return 'stale';
  const ageDays = Math.max(0, currentTime - updatedAt) / 86_400_000;
  if (ageDays >= offlineAreaStaleDays) return 'stale';
  if (ageDays >= offlineAreaUpdateRecommendedDays) {
    return 'update-recommended';
  }
  return 'fresh';
}

function uniqueResources(resources: OfflineAreaResource[]) {
  const seen = new Set<string>();
  return resources.filter((resource) => {
    if (seen.has(resource.url)) return false;
    seen.add(resource.url);
    return true;
  });
}

function uniqueDatasets(datasets: OfflineAreaDatasetSummary[]) {
  const seen = new Map<string, OfflineAreaDatasetSummary>();
  for (const dataset of datasets) seen.set(dataset.id, dataset);
  return [...seen.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
}

function defaultDatasetId(manifestUrl: string | URL) {
  const segments = new URL(manifestUrl).pathname.split('/').filter(Boolean);
  return segments.at(-2) ?? 'dataset';
}

function estimateChunkBytes(chunk: ManifestChunk) {
  if (typeof chunk.byteLength === 'number' && chunk.byteLength >= 0) {
    return chunk.byteLength;
  }
  return Math.max(minimumFallbackBytes, chunk.count * fallbackBytesPerPoint);
}

function estimateManifestBytes(manifest: OfflineManifest) {
  const cached = manifestByteLengths.get(manifest);
  if (cached !== undefined) return cached;
  const byteLength = new TextEncoder().encode(JSON.stringify(manifest)).length;
  manifestByteLengths.set(manifest, byteLength);
  return byteLength;
}

/** Builds a current, same-origin resource plan without changing generated data. */
export function planOfflineArea(
  manifestUrl: string | URL,
  manifest: OfflineManifest,
  chunkKeys: Iterable<string>,
  options: { datasetId?: string; includePointIndex?: boolean } = {},
): OfflineAreaPlan {
  const baseUrl = new URL('.', manifestUrl);
  const datasetId = options.datasetId ?? defaultDatasetId(manifestUrl);
  const resources: OfflineAreaResource[] = [
    {
      byteLength: estimateManifestBytes(manifest),
      key: `${datasetId}:manifest`,
      url: String(manifestUrl),
    },
  ];

  if (options.includePointIndex && manifest.pointIndexPath) {
    resources.push({
      byteLength: minimumFallbackBytes,
      key: `${datasetId}:point-index`,
      url: String(new URL(manifest.pointIndexPath, baseUrl)),
    });
  }

  for (const key of chunkKeys) {
    const chunk = manifest.chunks[key];
    if (!chunk) continue;
    resources.push({
      byteLength: estimateChunkBytes(chunk),
      key: `${datasetId}:${key}`,
      url: String(new URL(chunk.path, baseUrl)),
    });
  }

  const unique = uniqueResources(resources);
  return {
    datasets: [{ id: datasetId, refreshedAt: manifest.refreshedAt }],
    estimatedBytes: unique.reduce(
      (total, resource) => total + resource.byteLength,
      0,
    ),
    manifestRefreshedAt: manifest.refreshedAt,
    resources: unique,
  };
}

/** Combines point, network, and future dataset plans into one shared download. */
export function mergeOfflineAreaPlans(
  plans: Iterable<OfflineAreaPlan>,
): OfflineAreaPlan {
  const items = [...plans];
  const resources = uniqueResources(items.flatMap((plan) => plan.resources));
  const datasets = uniqueDatasets(items.flatMap((plan) => plan.datasets));
  return {
    datasets,
    estimatedBytes: resources.reduce(
      (total, resource) => total + resource.byteLength,
      0,
    ),
    manifestRefreshedAt:
      datasets
        .map((dataset) => dataset.refreshedAt)
        .sort()
        .at(-1) ?? '',
    resources,
  };
}

export function isCacheApiSupported() {
  return typeof caches !== 'undefined' && typeof caches.open === 'function';
}

export function isIndexedDbSupported() {
  return typeof indexedDB !== 'undefined';
}

export async function getOfflineStorageEstimate(): Promise<OfflineStorageEstimate> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return {};
  }
  return navigator.storage.estimate();
}

export async function requestOfflineStoragePersistence() {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) {
    return false;
  }
  return navigator.storage.persist();
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

async function openDatabase() {
  if (!isIndexedDbSupported()) {
    throw new Error('IndexedDB is not supported by this browser.');
  }
  const request = indexedDB.open(databaseName, databaseVersion);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(areaStoreName)) {
      request.result.createObjectStore(areaStoreName, { keyPath: 'id' });
    }
  };
  return requestToPromise(request);
}

export function createIndexedDbOfflineAreaStore(): OfflineAreaStore {
  async function transaction<T>(
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest<T>,
  ) {
    const database = await openDatabase();
    try {
      const tx = database.transaction(areaStoreName, mode);
      const result = await requestToPromise(
        operation(tx.objectStore(areaStoreName)),
      );
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () =>
          reject(tx.error ?? new Error('IndexedDB transaction failed.'));
        tx.onabort = () =>
          reject(tx.error ?? new Error('IndexedDB transaction aborted.'));
      });
      return result;
    } finally {
      database.close();
    }
  }

  return {
    delete: async (id) => {
      await transaction('readwrite', (store) => store.delete(id));
    },
    get: async (id) => transaction('readonly', (store) => store.get(id)),
    list: async () => {
      const records = await transaction('readonly', (store) => store.getAll());
      return records.sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt),
      );
    },
    put: async (record) => {
      await transaction('readwrite', (store) => store.put(record));
    },
  };
}

export function createMemoryOfflineAreaStore(
  initial: OfflineAreaRecord[] = [],
): OfflineAreaStore {
  const records = new Map(initial.map((record) => [record.id, record]));
  return {
    delete: async (id) => void records.delete(id),
    get: async (id) => records.get(id),
    list: async () =>
      [...records.values()].sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      ),
    put: async (record) => void records.set(record.id, record),
  };
}

export async function openOfflineAreaCache(): Promise<OfflineAreaCache> {
  if (!isCacheApiSupported()) {
    throw new Error('Cache storage is not supported by this browser.');
  }
  return caches.open(offlineAreaCacheName);
}

export async function estimateMissingOfflineAreaBytes(
  plan: OfflineAreaPlan,
  cache?: OfflineAreaCache,
) {
  const offlineCache = cache ?? (await openOfflineAreaCache());
  let missingBytes = 0;
  for (const resource of uniqueResources(plan.resources)) {
    if (!(await offlineCache.match(resource.url))) {
      missingBytes += resource.byteLength;
    }
  }
  return missingBytes;
}

function makeRecord(
  id: string,
  name: string,
  plan: OfflineAreaPlan,
  metadata?: OfflineAreaDownloadMetadata,
  existing?: OfflineAreaRecord,
): OfflineAreaRecord {
  const timestamp = now();
  return {
    bounds: metadata?.bounds ?? existing?.bounds,
    center: metadata?.center ?? existing?.center,
    createdAt: existing?.createdAt ?? timestamp,
    datasets: uniqueDatasets(metadata?.datasets ?? plan.datasets),
    estimatedBytes: plan.estimatedBytes,
    id,
    manifestRefreshedAt: plan.manifestRefreshedAt,
    name,
    resourceUrls: plan.resources.map((resource) => resource.url),
    status: 'downloading',
    updatedAt: timestamp,
  };
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted)
    throw new DOMException('Offline download cancelled.', 'AbortError');
}

/**
 * Caches a plan in a stable area cache. A record becomes complete only after
 * every planned resource is present, so callers never treat partial work as ready.
 */
export async function downloadOfflineArea(
  id: string,
  name: string,
  plan: OfflineAreaPlan,
  options: DownloadOfflineAreaOptions = {},
): Promise<DownloadOfflineAreaResult> {
  const store = options.store ?? createIndexedDbOfflineAreaStore();
  const cache = options.cache ?? (await openOfflineAreaCache());
  const fetcher = options.fetcher ?? fetch;
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 4, 8));
  const minimumRequestIntervalMs = Math.max(
    0,
    options.minimumRequestIntervalMs ?? 200,
  );
  const maximumRetries = Math.max(0, Math.min(options.maximumRetries ?? 2, 5));
  const existing = await store.get(id);
  const record = makeRecord(id, name, plan, options.metadata, existing);
  const resources = uniqueResources(plan.resources);
  let completedResources = 0;
  let completedBytes = 0;
  let resumed = false;
  let actualBytes = 0;

  // Keep an existing completed area usable until its replacement is complete.
  if (existing?.status !== 'complete') await store.put(record);
  const pending: OfflineAreaResource[] = [];
  for (const resource of resources) {
    throwIfAborted(options.signal);
    if (await cache.match(resource.url)) {
      completedResources += 1;
      completedBytes += resource.byteLength;
      actualBytes += resource.byteLength;
      resumed = true;
    } else {
      pending.push(resource);
    }
  }
  options.onProgress?.({
    completedBytes,
    completedResources,
    totalBytes: plan.estimatedBytes,
    totalResources: resources.length,
  });

  let next = 0;
  let nextRequestStartedAt = 0;
  const sleep = (milliseconds: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

  async function waitForProviderSlot(url: string) {
    if (
      minimumRequestIntervalMs === 0 ||
      new URL(url).origin !== 'https://tiles.openfreemap.org'
    ) {
      return;
    }
    const currentTime = Date.now();
    const requestStartedAt = Math.max(currentTime, nextRequestStartedAt);
    nextRequestStartedAt = requestStartedAt + minimumRequestIntervalMs;
    if (requestStartedAt > currentTime) {
      await sleep(requestStartedAt - currentTime);
    }
  }

  async function fetchResource(resource: OfflineAreaResource) {
    let attempt = 0;
    while (true) {
      throwIfAborted(options.signal);
      await waitForProviderSlot(resource.url);
      try {
        const response = await fetcher(resource.url, {
          signal: options.signal,
        });
        if (response.ok) return response;
        if (
          attempt >= maximumRetries ||
          ![429, 500, 502, 503, 504].includes(response.status)
        ) {
          throw new Error(
            `Offline resource request failed (${response.status}): ${resource.url}`,
          );
        }
        const retryAfter = Number(response.headers.get('retry-after'));
        await sleep(
          Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1_000
            : 250 * 2 ** attempt,
        );
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          throw error;
        }
        if (
          attempt >= maximumRetries ||
          (error instanceof Error &&
            error.message.startsWith('Offline resource request failed'))
        ) {
          throw error;
        }
        await sleep(250 * 2 ** attempt);
      }
      attempt += 1;
    }
  }

  async function worker() {
    while (next < pending.length) {
      throwIfAborted(options.signal);
      const resource = pending[next++];
      const response = await fetchResource(resource);
      throwIfAborted(options.signal);
      await cache.put(resource.url, response.clone());
      completedResources += 1;
      completedBytes += resource.byteLength;
      const contentLength = Number(response.headers.get('content-length'));
      actualBytes +=
        Number.isFinite(contentLength) && contentLength >= 0
          ? contentLength
          : resource.byteLength;
      options.onProgress?.({
        completedBytes,
        completedResources,
        totalBytes: plan.estimatedBytes,
        totalResources: resources.length,
      });
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, pending.length) }, worker),
  );
  throwIfAborted(options.signal);
  const completeRecord: OfflineAreaRecord = {
    ...record,
    actualBytes,
    status: 'complete',
    updatedAt: now(),
  };
  await store.put(completeRecord);

  if (existing?.status === 'complete') {
    const currentUrls = new Set(completeRecord.resourceUrls);
    const retainedUrls = new Set(
      (await store.list()).flatMap((area) => area.resourceUrls),
    );
    await Promise.all(
      existing.resourceUrls
        .filter((url) => !currentUrls.has(url) && !retainedUrls.has(url))
        .map((url) => cache.delete(url)),
    );
  }
  return { record: completeRecord, resumed };
}

export async function listOfflineAreas(
  store: OfflineAreaStore = createIndexedDbOfflineAreaStore(),
) {
  return store.list();
}

export async function listCompletedOfflineAreas(
  store: OfflineAreaStore = createIndexedDbOfflineAreaStore(),
) {
  return (await store.list()).filter((area) => area.status === 'complete');
}

export async function getOfflineArea(
  id: string,
  store: OfflineAreaStore = createIndexedDbOfflineAreaStore(),
) {
  return store.get(id);
}

export async function updateOfflineArea(
  id: string,
  updates: Pick<Partial<OfflineAreaRecord>, 'name'>,
  store: OfflineAreaStore = createIndexedDbOfflineAreaStore(),
) {
  const record = await store.get(id);
  if (!record) return undefined;
  const updated = { ...record, ...updates, updatedAt: now() };
  await store.put(updated);
  return updated;
}

/** Removes only cache entries no other saved area still references. */
export async function removeOfflineArea(
  id: string,
  options: { cache?: OfflineAreaCache; store?: OfflineAreaStore } = {},
) {
  const store = options.store ?? createIndexedDbOfflineAreaStore();
  const record = await store.get(id);
  if (!record) return false;
  const cache = options.cache ?? (await openOfflineAreaCache());
  await store.delete(id);
  const retainedUrls = new Set(
    (await store.list()).flatMap((area) => area.resourceUrls),
  );
  await Promise.all(
    record.resourceUrls
      .filter((url) => !retainedUrls.has(url))
      .map((url) => cache.delete(url)),
  );
  return true;
}
