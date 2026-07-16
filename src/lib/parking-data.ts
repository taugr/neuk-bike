import type { ParkingMapBounds } from '@/lib/map-pins';
import type {
  ParkingDataManifest,
  ParkingPoint,
  UserLocation,
} from '@/lib/types';

type Fetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

type ParkingDataChunk = {
  key: string;
  points: ParkingPoint[];
  schemaVersion: number;
};

const defaultMaximumCachedChunks = 24;
const defaultMaximumViewportChunks = 16;

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function toParkingTile(
  location: UserLocation,
  zoom: number,
): { x: number; y: number } {
  const tileCount = 2 ** zoom;
  const latitude = Math.max(
    -85.05112878,
    Math.min(85.05112878, location.latitude),
  );
  const latitudeRadians = toRadians(latitude);
  const x = Math.floor(((location.longitude + 180) / 360) * tileCount);
  const y = Math.floor(
    ((1 - Math.asinh(Math.tan(latitudeRadians)) / Math.PI) / 2) * tileCount,
  );

  return {
    x: Math.max(0, Math.min(tileCount - 1, x)),
    y: Math.max(0, Math.min(tileCount - 1, y)),
  };
}

function tileKey(zoom: number, x: number, y: number) {
  return `${zoom}/${x}/${y}`;
}

export function getParkingTileKeysAroundLocation(
  location: UserLocation,
  manifest: ParkingDataManifest,
  radius = 1,
) {
  const center = toParkingTile(location, manifest.chunkZoom);
  const keys: string[] = [];

  for (let yOffset = -radius; yOffset <= radius; yOffset += 1) {
    for (let xOffset = -radius; xOffset <= radius; xOffset += 1) {
      const key = tileKey(
        manifest.chunkZoom,
        center.x + xOffset,
        center.y + yOffset,
      );
      if (manifest.chunks[key]) {
        keys.push(key);
      }
    }
  }

  return keys;
}

export function getParkingTileKeysForBounds(
  bounds: ParkingMapBounds,
  manifest: ParkingDataManifest,
  buffer = 1,
  maximumChunks = defaultMaximumViewportChunks,
) {
  const northWest = toParkingTile(
    { latitude: bounds.north, longitude: bounds.west },
    manifest.chunkZoom,
  );
  const southEast = toParkingTile(
    { latitude: bounds.south, longitude: bounds.east },
    manifest.chunkZoom,
  );
  const center = toParkingTile(
    {
      latitude: (bounds.north + bounds.south) / 2,
      longitude: (bounds.east + bounds.west) / 2,
    },
    manifest.chunkZoom,
  );
  const candidates: { distance: number; key: string }[] = [];

  for (let y = northWest.y - buffer; y <= southEast.y + buffer; y += 1) {
    for (let x = northWest.x - buffer; x <= southEast.x + buffer; x += 1) {
      const key = tileKey(manifest.chunkZoom, x, y);
      if (manifest.chunks[key]) {
        candidates.push({
          distance: Math.hypot(x - center.x, y - center.y),
          key,
        });
      }
    }
  }

  return candidates
    .sort((left, right) => left.distance - right.distance)
    .slice(0, maximumChunks)
    .map(({ key }) => key);
}

export function isLocationInParkingCoverage(
  location: UserLocation,
  manifest: ParkingDataManifest,
) {
  const { bounds } = manifest.coverage;
  return (
    location.latitude >= bounds.south &&
    location.latitude <= bounds.north &&
    location.longitude >= bounds.west &&
    location.longitude <= bounds.east
  );
}

export function getParkingDataBaseUrl(currentUrl: string) {
  return new URL('data/parking/', new URL('.', currentUrl));
}

function assertManifest(value: unknown): asserts value is ParkingDataManifest {
  const candidate = value as Partial<ParkingDataManifest> | null;
  if (
    !candidate ||
    candidate.schemaVersion !== 1 ||
    typeof candidate.chunkZoom !== 'number' ||
    typeof candidate.recordCount !== 'number' ||
    typeof candidate.pointIndexPath !== 'string' ||
    !candidate.chunks ||
    !candidate.coverage ||
    !Array.isArray(candidate.sources)
  ) {
    throw new Error('Parking manifest has an unsupported shape.');
  }
}

function assertChunk(
  value: unknown,
  key: string,
): asserts value is ParkingDataChunk {
  const candidate = value as Partial<ParkingDataChunk> | null;
  if (
    !candidate ||
    candidate.schemaVersion !== 1 ||
    candidate.key !== key ||
    !Array.isArray(candidate.points)
  ) {
    throw new Error(`Parking chunk ${key} has an unsupported shape.`);
  }
}

export class ParkingDataClient {
  private readonly baseUrl: URL;
  private readonly fetcher: Fetcher;
  private readonly maximumCachedChunks: number;
  private manifest: ParkingDataManifest | null = null;
  private readonly chunks = new Map<string, ParkingPoint[]>();
  private readonly inFlightChunks = new Map<string, Promise<void>>();
  private pointIndex: Record<string, string> | null = null;

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
    if (this.manifest) {
      return this.manifest;
    }

    const response = await this.fetcher(new URL('manifest.json', this.baseUrl));
    if (!response.ok) {
      throw new Error(`Parking manifest request failed (${response.status}).`);
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
    const points = new Map<string, ParkingPoint>();
    for (const chunkPoints of this.chunks.values()) {
      for (const point of chunkPoints) {
        points.set(point.id, point);
      }
    }
    return [...points.values()];
  }

  getLoadedChunkKeys() {
    return [...this.chunks.keys()];
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
    const manifest = await this.initialize();
    if (!this.pointIndex) {
      const response = await this.fetcher(
        new URL(manifest.pointIndexPath, this.baseUrl),
      );
      if (!response.ok) {
        throw new Error(
          `Parking point index request failed (${response.status}).`,
        );
      }
      const pointIndex: unknown = await response.json();
      if (!pointIndex || typeof pointIndex !== 'object') {
        throw new Error('Parking point index has an unsupported shape.');
      }
      this.pointIndex = pointIndex as Record<string, string>;
    }

    const resolvedId = this.pointIndex[id]
      ? id
      : !id.includes(':') && this.pointIndex[`cec:${id}`]
        ? `cec:${id}`
        : id;
    const key = this.pointIndex[resolvedId];
    if (!key || !manifest.chunks[key]) {
      return null;
    }
    await this.loadKeys([key]);
    return (
      this.getLoadedPoints().find((point) => point.id === resolvedId) ?? null
    );
  }

  private async loadKeys(keys: string[]) {
    const manifest = await this.initialize();
    await Promise.all(
      keys.map(async (key) => {
        if (this.chunks.has(key)) {
          const points = this.chunks.get(key)!;
          this.chunks.delete(key);
          this.chunks.set(key, points);
          return;
        }

        const currentRequest = this.inFlightChunks.get(key);
        if (currentRequest) {
          return currentRequest;
        }

        const request = (async () => {
          const chunkMetadata = manifest.chunks[key];
          if (!chunkMetadata) {
            return;
          }
          const response = await this.fetcher(
            new URL(chunkMetadata.path, this.baseUrl),
          );
          if (!response.ok) {
            throw new Error(
              `Parking chunk ${key} request failed (${response.status}).`,
            );
          }
          const chunk: unknown = await response.json();
          assertChunk(chunk, key);
          this.chunks.set(key, chunk.points);

          while (this.chunks.size > this.maximumCachedChunks) {
            const oldestKey = this.chunks.keys().next().value;
            if (!oldestKey) {
              break;
            }
            this.chunks.delete(oldestKey);
          }
        })().finally(() => this.inFlightChunks.delete(key));

        this.inFlightChunks.set(key, request);
        return request;
      }),
    );
    return this.getLoadedPoints();
  }
}
