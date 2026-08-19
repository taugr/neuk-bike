import type { ParkingMapBounds } from '@/lib/map-pins';
import { getParkingTileKeysForBounds } from '@/lib/parking-data';

export type CycleNetworkKind = 'traffic-free' | 'on-road' | 'ferry' | 'unknown';
export type CycleNetworkRouteType = 'ncn' | 'rcn' | 'link' | 'unknown';
export type CycleNetworkOpenStatus = 'open' | 'temporary-closure' | 'unknown';
export type CycleNetworkSurface =
  | 'asphalt'
  | 'bare-earth'
  | 'cobbles'
  | 'concrete'
  | 'flexible-surface'
  | 'grass'
  | 'other'
  | 'paving-blocks'
  | 'paving-slabs'
  | 'rocky'
  | 'unsealed-firm'
  | 'unsealed-loose';
export type CycleNetworkQuality =
  | 'acceptable'
  | 'mountain-bike-only'
  | 'rough'
  | 'smooth'
  | 'standard';
export type CycleNetworkLighting = 'fully-lit' | 'partly-lit' | 'unlit';

type LineGeometry = {
  coordinates: [number, number][] | [number, number][][];
  type: 'LineString' | 'MultiLineString';
};

export type CycleNetworkFeature = {
  geometry: LineGeometry;
  id: string;
  properties: {
    greenway: boolean | null;
    kind: CycleNetworkKind;
    lighting?: CycleNetworkLighting;
    linkNumber?: number;
    openStatus: CycleNetworkOpenStatus;
    quality?: CycleNetworkQuality;
    roadClass?: string;
    routeCategory?: string;
    routeNumber?: number;
    routeType: CycleNetworkRouteType;
    segmentId: number;
    surface?: CycleNetworkSurface;
  };
  type: 'Feature';
};

export type CycleNetworkManifest = {
  chunkZoom: number;
  chunks: Record<
    string,
    {
      bounds: ParkingMapBounds;
      byteLength?: number;
      count: number;
      path: string;
    }
  >;
  coverage: { bounds: ParkingMapBounds; label: string };
  recordCount: number;
  refreshedAt: string;
  releaseId?: string;
  schemaVersion: 2;
  source: {
    attribution: string;
    dataEditedAt: string;
    itemUrl: string;
    label: string;
    licenceName: string;
    licenceUrl: string;
    publisher: string;
  };
};

type CycleNetworkChunk = {
  features: CycleNetworkFeature[];
  key: string;
  schemaVersion: 2;
};

type Fetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type CycleNetworkViewportData = {
  available: boolean;
  features: CycleNetworkFeature[];
  visible: boolean;
};

const defaultMaximumCachedChunks = 48;
const defaultMaximumViewportChunks = 24;

export function getCycleNetworkDataBaseUrl(currentUrl: string) {
  return new URL('data/cycle-network/', new URL('.', currentUrl));
}

export function isCycleNetworkAvailableForBounds(
  bounds: ParkingMapBounds,
  manifest: CycleNetworkManifest,
) {
  const coverage = manifest.coverage.bounds;
  return !(
    bounds.east < coverage.west ||
    bounds.west > coverage.east ||
    bounds.north < coverage.south ||
    bounds.south > coverage.north
  );
}

function assertManifest(value: unknown): asserts value is CycleNetworkManifest {
  const candidate = value as Partial<CycleNetworkManifest> | null;
  if (
    !candidate ||
    candidate.schemaVersion !== 2 ||
    typeof candidate.chunkZoom !== 'number' ||
    typeof candidate.recordCount !== 'number' ||
    !candidate.chunks ||
    !candidate.coverage?.bounds ||
    !candidate.source?.attribution
  ) {
    throw new Error('Cycle network manifest has an unsupported shape.');
  }
}

function assertChunk(
  value: unknown,
  key: string,
): asserts value is CycleNetworkChunk {
  const candidate = value as Partial<CycleNetworkChunk> | null;
  if (
    !candidate ||
    candidate.schemaVersion !== 2 ||
    candidate.key !== key ||
    !Array.isArray(candidate.features)
  ) {
    throw new Error(`Cycle network chunk ${key} has an unsupported shape.`);
  }
}

export class CycleNetworkDataClient {
  private readonly baseUrl: URL;
  private readonly fetcher: Fetcher;
  private readonly maximumCachedChunks: number;
  private manifest: CycleNetworkManifest | null = null;
  private readonly chunks = new Map<string, CycleNetworkChunk>();
  private readonly inFlightChunks = new Map<string, Promise<void>>();

  constructor(
    baseUrl: URL,
    fetcher: Fetcher = (input, init) => fetch(input, init),
    maximumCachedChunks = defaultMaximumCachedChunks,
  ) {
    this.baseUrl = baseUrl;
    this.fetcher = fetcher;
    this.maximumCachedChunks = maximumCachedChunks;
  }

  async initialize() {
    if (this.manifest) return this.manifest;
    const response = await this.fetcher(
      new URL('manifest.json', this.baseUrl),
      {
        cache: 'no-cache',
      },
    );
    if (!response.ok) {
      throw new Error(
        `Cycle network manifest request failed (${response.status}).`,
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

  async loadBounds(
    bounds: ParkingMapBounds,
    zoom: number,
    { loadFeatures = true }: { loadFeatures?: boolean } = {},
  ): Promise<CycleNetworkViewportData> {
    const manifest = await this.initialize();
    const keys = isCycleNetworkAvailableForBounds(bounds, manifest)
      ? getParkingTileKeysForBounds(
          bounds,
          manifest,
          1,
          defaultMaximumViewportChunks,
        )
      : [];
    const available = keys.length > 0;
    if (!available || zoom < manifest.chunkZoom || !loadFeatures) {
      return { available, features: [], visible: false };
    }
    await this.loadKeys(keys, manifest);

    const features = new Map<string, CycleNetworkFeature>();
    for (const key of keys) {
      const chunk = this.chunks.get(key);
      for (const feature of chunk?.features ?? [])
        features.set(feature.id, feature);
    }
    return {
      available,
      features: [...features.values()],
      visible: keys.length > 0,
    };
  }

  private async loadKeys(keys: string[], manifest: CycleNetworkManifest) {
    await Promise.all(
      keys.map(async (key) => {
        const cached = this.chunks.get(key);
        if (cached) {
          this.chunks.delete(key);
          this.chunks.set(key, cached);
          return;
        }
        const currentRequest = this.inFlightChunks.get(key);
        if (currentRequest) return currentRequest;

        const request = (async () => {
          const metadata = manifest.chunks[key];
          if (!metadata) return;
          const response = await this.fetcher(
            new URL(metadata.path, this.baseUrl),
          );
          if (!response.ok) {
            throw new Error(
              `Cycle network chunk ${key} request failed (${response.status}).`,
            );
          }
          const chunk: unknown = await response.json();
          assertChunk(chunk, key);
          this.chunks.set(key, chunk);
          while (this.chunks.size > this.maximumCachedChunks) {
            const oldestKey = this.chunks.keys().next().value;
            if (!oldestKey) break;
            this.chunks.delete(oldestKey);
          }
        })().finally(() => this.inFlightChunks.delete(key));
        this.inFlightChunks.set(key, request);
        return request;
      }),
    );
  }
}
