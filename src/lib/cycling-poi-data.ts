import {
  getParkingTileKeysAroundLocation,
  getParkingTileKeysForBounds,
} from '@/lib/parking-data';
import type { ParkingMapBounds } from '@/lib/map-pins';
import type {
  CyclingPoiDataManifest,
  CyclingPoiPoint,
  UserLocation,
} from '@/lib/types';

type Fetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

type CyclingPoiChunk = {
  key: string;
  points: CyclingPoiPoint[];
  schemaVersion: 2;
};

function assertManifest(
  value: unknown,
): asserts value is CyclingPoiDataManifest {
  const candidate = value as Partial<CyclingPoiDataManifest> | null;
  if (
    !candidate ||
    candidate.schemaVersion !== 2 ||
    typeof candidate.chunkZoom !== 'number' ||
    typeof candidate.recordCount !== 'number' ||
    typeof candidate.pointIndexPath !== 'string' ||
    !candidate.chunks ||
    !candidate.categoryCounts ||
    !candidate.coverage ||
    !Array.isArray(candidate.coverage.areas)
  ) {
    throw new Error('Cycling POI manifest has an unsupported shape.');
  }
}

function assertChunk(
  value: unknown,
  key: string,
): asserts value is CyclingPoiChunk {
  const candidate = value as Partial<CyclingPoiChunk> | null;
  if (
    !candidate ||
    candidate.schemaVersion !== 2 ||
    candidate.key !== key ||
    !Array.isArray(candidate.points)
  ) {
    throw new Error(`Cycling POI chunk ${key} has an unsupported shape.`);
  }
}

export function getCyclingPoiDataBaseUrl(currentUrl: string) {
  return new URL('data/cycling-pois/', new URL('.', currentUrl));
}

export class CyclingPoiDataClient {
  private manifest: CyclingPoiDataManifest | null = null;
  private readonly chunks = new Map<string, CyclingPoiPoint[]>();
  private readonly inFlight = new Map<string, Promise<void>>();
  private pointIndex: Record<string, string> | null = null;
  private pointIndexRequest: Promise<Record<string, string>> | null = null;

  constructor(
    private readonly baseUrl: URL,
    private readonly fetcher: Fetcher = (input, init) => fetch(input, init),
  ) {}

  async initialize() {
    if (this.manifest) return this.manifest;
    const response = await this.fetcher(
      new URL('manifest.json', this.baseUrl),
      { cache: 'no-cache' },
    );
    if (!response.ok) {
      throw new Error(
        `Cycling POI manifest request failed (${response.status}).`,
      );
    }
    const manifest: unknown = await response.json();
    assertManifest(manifest);
    this.manifest = manifest;
    return manifest;
  }

  getManifest() {
    return this.manifest;
  }

  getLoadedPoints() {
    const points = new Map<string, CyclingPoiPoint>();
    for (const chunk of this.chunks.values()) {
      for (const point of chunk) points.set(point.id, point);
    }
    return [...points.values()];
  }

  async loadLocation(location: UserLocation, radius = 1) {
    const manifest = await this.initialize();
    return this.loadKeys(
      getParkingTileKeysAroundLocation(location, manifest, radius),
    );
  }

  async loadBounds(bounds: ParkingMapBounds) {
    const manifest = await this.initialize();
    return this.loadKeys(getParkingTileKeysForBounds(bounds, manifest));
  }

  async loadPoint(id: string) {
    const { points } = await this.loadPoints([id], { allowPartial: false });
    return points[0] ?? null;
  }

  async loadPoints(
    ids: string[],
    { allowPartial = true }: { allowPartial?: boolean } = {},
  ) {
    const manifest = await this.initialize();
    const pointIndex = await this.loadPointIndex(manifest);
    const idsByKey = new Map<string, Set<string>>();
    const missingIds = new Set<string>();
    const failedIds = new Set<string>();

    for (const id of ids) {
      const key = pointIndex[id];
      if (!key || !manifest.chunks[key]) {
        missingIds.add(id);
        continue;
      }
      const keyIds = idsByKey.get(key) ?? new Set<string>();
      keyIds.add(id);
      idsByKey.set(key, keyIds);
    }

    const pointsById = new Map<string, CyclingPoiPoint>();
    for (const [key, expectedIds] of idsByKey) {
      try {
        const points = await this.loadKeys([key]);
        const foundIds = new Set<string>();
        for (const point of points) {
          if (expectedIds.has(point.id)) {
            pointsById.set(point.id, point);
            foundIds.add(point.id);
          }
        }
        for (const id of expectedIds) {
          if (!foundIds.has(id)) missingIds.add(id);
        }
      } catch (error) {
        if (!allowPartial) throw error;
        for (const id of expectedIds) failedIds.add(id);
      }
    }

    return {
      failedIds: [...failedIds],
      missingIds: [...missingIds],
      points: ids.flatMap((id) => {
        const point = pointsById.get(id);
        return point ? [point] : [];
      }),
    };
  }

  private async loadPointIndex(manifest: CyclingPoiDataManifest) {
    if (this.pointIndex) return this.pointIndex;
    if (!this.pointIndexRequest) {
      this.pointIndexRequest = (async () => {
        const response = await this.fetcher(
          new URL(manifest.pointIndexPath, this.baseUrl),
        );
        if (!response.ok) {
          throw new Error(
            `Cycling POI point index request failed (${response.status}).`,
          );
        }
        const pointIndex: unknown = await response.json();
        if (!pointIndex || typeof pointIndex !== 'object') {
          throw new Error('Cycling POI point index has an unsupported shape.');
        }
        this.pointIndex = pointIndex as Record<string, string>;
        return this.pointIndex;
      })().finally(() => {
        this.pointIndexRequest = null;
      });
    }
    return this.pointIndexRequest;
  }

  private async loadKeys(keys: string[]) {
    const manifest = await this.initialize();
    await Promise.all(
      keys.map(async (key) => {
        if (this.chunks.has(key)) return;
        const pending = this.inFlight.get(key);
        if (pending) return pending;
        const request = (async () => {
          const metadata = manifest.chunks[key];
          if (!metadata) return;
          const response = await this.fetcher(
            new URL(metadata.path, this.baseUrl),
          );
          if (!response.ok) {
            throw new Error(
              `Cycling POI chunk ${key} request failed (${response.status}).`,
            );
          }
          const chunk: unknown = await response.json();
          assertChunk(chunk, key);
          this.chunks.set(key, chunk.points);
        })().finally(() => this.inFlight.delete(key));
        this.inFlight.set(key, request);
        return request;
      }),
    );
    return this.getLoadedPoints();
  }
}
