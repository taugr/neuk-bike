import { MercatorCoordinate, type LngLatBounds } from 'maplibre-gl';
import {
  decodeEdinburghMesh,
  edinburghMeshVersion,
  edinburghMeshZoom,
} from './edinburgh-mesh';
import {
  decodeEdinburghOverview,
  edinburghCityOverviewZoom,
  edinburghOverviewZoom,
} from './edinburgh-overview-mesh';

const root = '/data/edinburgh-buildings';
type Area = { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown[] };
type Manifest = {
  version: number;
  zoom: number;
  boundary: Area;
  tiles: string[];
  demTiles: string[];
};
type MeshIndex = { boundary: Area; tiles: Set<string>; demTiles: Set<string> };
let pendingIndex: Promise<MeshIndex> | undefined;
type OverviewIndex = Record<string, { bytes: number; triangles: number }>;
let pendingOverview: Promise<OverviewIndex> | undefined;
let pendingCityOverview: Promise<OverviewIndex> | undefined;

export function edinburghBuildingIndex() {
  return (pendingIndex ??= fetch(`${root}/index.json`)
    .then(async (response) => {
      if (!response.ok)
        throw new Error(`Edinburgh building index: ${response.status}`);
      const index = (await response.json()) as Manifest;
      if (
        index.version !== edinburghMeshVersion ||
        index.zoom !== edinburghMeshZoom
      )
        throw new Error('Unknown Edinburgh building index version');
      return {
        boundary: index.boundary,
        tiles: new Set(index.tiles),
        demTiles: new Set(index.demTiles),
      };
    })
    .catch((error: unknown) => {
      pendingIndex = undefined;
      throw error;
    }));
}

export function edinburghOverviewIndex() {
  return (pendingOverview ??= loadOverviewIndex('overview').catch(
    (error: unknown) => {
      pendingOverview = undefined;
      throw error;
    },
  ));
}

export function edinburghCityOverviewIndex() {
  return (pendingCityOverview ??= loadOverviewIndex('city-overview').catch(
    (error: unknown) => {
      pendingCityOverview = undefined;
      throw error;
    },
  ));
}

async function loadOverviewIndex(directory: 'overview' | 'city-overview') {
  const version = directory === 'city-overview' ? 2 : 1;
  const response = await fetch(`${root}/${directory}/index.json?v=${version}`);
  if (!response.ok)
    throw new Error(`Edinburgh ${directory} index: ${response.status}`);
  return (await response.json()) as OverviewIndex;
}

export async function edinburghCityTerrainTile(
  z: number,
  x: number,
  y: number,
) {
  const index = await edinburghBuildingIndex();
  const key = `${z}/${x}/${y}`;
  return index.demTiles.has(key) ? `${root}/dem/${key}.png` : undefined;
}

export function edinburghMeshViewport(
  bounds: LngLatBounds,
  center: MercatorCoordinate,
  available: ReadonlySet<string>,
  radius = 1,
) {
  const scale = 2 ** edinburghMeshZoom;
  const { x: left, y: top } = MercatorCoordinate.fromLngLat(
    bounds.getNorthWest(),
  );
  const { x: right, y: bottom } = MercatorCoordinate.fromLngLat(
    bounds.getSouthEast(),
  );
  const cx = Math.floor(center.x * scale);
  const cy = Math.floor(center.y * scale);
  const minX = Math.max(cx - radius, Math.floor(left * scale - 0.3));
  const maxX = Math.min(cx + radius, Math.floor(right * scale + 0.3));
  const minY = Math.max(cy - radius, Math.floor(top * scale - 0.3));
  const maxY = Math.min(cy + radius, Math.floor(bottom * scale + 0.3));
  const tiles: { key: string; distance: number }[] = [];
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      const key = `${x}/${y}`;
      if (available.has(key))
        tiles.push({ key, distance: Math.abs(x - cx) + Math.abs(y - cy) });
    }
  }
  tiles.sort((a, b) => a.distance - b.distance);
  const [west, north] = new MercatorCoordinate(minX / scale, minY / scale)
    .toLngLat()
    .toArray();
  const [east, south] = new MercatorCoordinate(
    (maxX + 1) / scale,
    (maxY + 1) / scale,
  )
    .toLngLat()
    .toArray();
  return {
    tiles: tiles.map(({ key }) => key),
    envelope: {
      type: 'Polygon' as const,
      coordinates: [
        [
          [west, south],
          [east, south],
          [east, north],
          [west, north],
          [west, south],
        ],
      ],
    },
    signature: `${minX}/${minY}/${maxX}/${maxY}`,
  };
}

export function selectEdinburghMeshViewport(
  requested: ReturnType<typeof edinburghMeshViewport> | undefined,
  nearest: ReturnType<typeof edinburghMeshViewport> | undefined,
  displayed: ReturnType<typeof edinburghMeshViewport> | undefined,
  loaded: ReadonlyMap<string, unknown>,
  missing: ReadonlySet<string>,
) {
  if (!requested?.tiles.length) return;
  const pending = requested.tiles.some(
    (key) => !loaded.has(key) && !missing.has(key),
  );
  // Keep both the mesh and its fallback mask until the next window is ready.
  // A small change in framing can also fit entirely inside the current window.
  if (
    displayed &&
    (pending || requested.tiles.every((key) => displayed.tiles.includes(key)))
  ) {
    return displayed;
  }
  if (requested.tiles.every((key) => loaded.has(key))) return requested;
  if (nearest?.tiles.length && nearest.tiles.every((key) => loaded.has(key))) {
    return nearest;
  }
}

export const edinburghOverviewTileLimit = 12;
const overviewTransferBudget = 8 * 1024 * 1024;
const overviewTriangleBudget = 1_000_000;
const cityOverviewTransferBudget = 12 * 1024 * 1024;
const cityOverviewTriangleBudget = 1_500_000;

export function edinburghOverviewViewport(
  bounds: LngLatBounds,
  center: MercatorCoordinate,
  index: OverviewIndex,
) {
  return overviewViewport(
    bounds,
    center,
    index,
    edinburghOverviewZoom,
    overviewTransferBudget,
    overviewTriangleBudget,
  );
}

export function edinburghCityOverviewViewport(
  bounds: LngLatBounds,
  center: MercatorCoordinate,
  index: OverviewIndex,
  neighbourhoods: OverviewIndex | undefined,
  covered: ReadonlySet<string>,
) {
  return overviewViewport(
    bounds,
    center,
    index,
    edinburghCityOverviewZoom,
    cityOverviewTransferBudget,
    cityOverviewTriangleBudget,
    (x, y, left, top, right, bottom) => {
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 2; col++) {
          const childX = x * 2 + col;
          const childY = y * 2 + row;
          if (
            childX + 1 < left * 2 ||
            childX > right * 2 ||
            childY + 1 < top * 2 ||
            childY > bottom * 2
          )
            continue;
          const key = `${childX}/${childY}`;
          if ((!neighbourhoods || neighbourhoods[key]) && !covered.has(key))
            return true;
        }
      }
      return false;
    },
  );
}

function overviewViewport(
  bounds: LngLatBounds,
  center: MercatorCoordinate,
  index: OverviewIndex,
  zoom: number,
  transferBudget: number,
  triangleBudget: number,
  needed?: (
    x: number,
    y: number,
    left: number,
    top: number,
    right: number,
    bottom: number,
  ) => boolean,
) {
  const scale = 2 ** zoom;
  const nw = MercatorCoordinate.fromLngLat(bounds.getNorthWest());
  const se = MercatorCoordinate.fromLngLat(bounds.getSouthEast());
  const left = nw.x * scale,
    top = nw.y * scale;
  const right = se.x * scale,
    bottom = se.y * scale;
  const padX = Math.min(0.35, (right - left) * 0.15);
  const padY = Math.min(0.35, (bottom - top) * 0.15);
  // Use the list of surveyed tiles, so a pitched horizon never makes us scan
  // an unbounded range of empty tiles.
  const candidates = Object.entries(index)
    .flatMap(([key, cost]) => {
      const [x, y] = key.split('/').map(Number);
      if (
        x + 1 < left - padX ||
        x > right + padX ||
        y + 1 < top - padY ||
        y > bottom + padY ||
        (needed &&
          !needed(x, y, left - padX, top - padY, right + padX, bottom + padY))
      )
        return [];
      const buffered = Number(
        x + 1 < left || x > right || y + 1 < top || y > bottom,
      );
      const distance = Math.hypot(
        x + 0.5 - center.x * scale,
        y + 0.5 - center.y * scale,
      );
      return [{ key, cost, distance, buffered }];
    })
    .sort((a, b) => a.buffered - b.buffered || a.distance - b.distance);
  return budgetOverviewTiles(
    candidates.map(({ key }) => key),
    index,
    transferBudget,
    triangleBudget,
  );
}

function budgetOverviewTiles(
  candidates: Iterable<string>,
  index: OverviewIndex,
  transferBudget: number,
  triangleBudget: number,
) {
  const keys: string[] = [];
  let bytes = 0;
  let triangles = 0;
  for (const key of candidates) {
    const cost = index[key];
    if (keys.length >= edinburghOverviewTileLimit) break;
    if (
      bytes + cost.bytes > transferBudget ||
      triangles + cost.triangles > triangleBudget
    )
      break;
    bytes += cost.bytes;
    triangles += cost.triangles;
    keys.push(key);
  }
  return keys;
}

export function edinburghOverviewTransition(
  requested: string[],
  displayed: string[],
  ready: ReadonlyMap<string, unknown>,
  missing: ReadonlySet<string>,
  bounds: LngLatBounds,
  index: OverviewIndex,
  zoom: typeof edinburghOverviewZoom | typeof edinburghCityOverviewZoom,
) {
  const loaded = requested.filter((key) => ready.has(key));
  if (
    loaded.length === requested.length ||
    requested.every((key) => ready.has(key) || missing.has(key))
  )
    return loaded;
  const scale = 2 ** zoom;
  const nw = MercatorCoordinate.fromLngLat(bounds.getNorthWest());
  const se = MercatorCoordinate.fromLngLat(bounds.getSouthEast());
  const retained = displayed.filter((key) => {
    if (!ready.has(key)) return false;
    const [x, y] = key.split('/').map(Number);
    return (
      x + 1 >= nw.x * scale &&
      x <= se.x * scale &&
      y + 1 >= nw.y * scale &&
      y <= se.y * scale
    );
  });
  const city = zoom === edinburghCityOverviewZoom;
  return budgetOverviewTiles(
    new Set([...retained, ...loaded]),
    index,
    city ? cityOverviewTransferBudget : overviewTransferBudget,
    city ? cityOverviewTriangleBudget : overviewTriangleBudget,
  );
}

async function loadCompressedMesh(path: string, signal: AbortSignal) {
  const load = async () => {
    const response = await fetch(path, { signal });
    if (!response.ok || !response.body)
      throw new Error(`Edinburgh mesh ${path}: ${response.status}`);
    const stream = response.body.pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).arrayBuffer();
  };
  return load().catch((error: unknown) => {
    if (signal.aborted || !(error instanceof TypeError)) throw error;
    return load();
  });
}

export async function loadEdinburghCityMesh(key: string, signal: AbortSignal) {
  const bytes = await loadCompressedMesh(
    `${root}/meshes/${key}.bin.gz?v=${edinburghMeshVersion}.4`,
    signal,
  );
  const [x, y] = key.split('/').map(Number);
  return decodeEdinburghMesh(bytes, x, y);
}

export async function loadEdinburghOverviewMesh(
  key: string,
  signal: AbortSignal,
) {
  const bytes = await loadCompressedMesh(
    `${root}/overview/${key}.bin.gz?v=1`,
    signal,
  );
  const [x, y] = key.split('/').map(Number);
  return decodeEdinburghOverview(bytes, x, y);
}

export async function loadEdinburghCityOverviewMesh(
  key: string,
  signal: AbortSignal,
) {
  const bytes = await loadCompressedMesh(
    `${root}/city-overview/${key}.bin.gz?v=2`,
    signal,
  );
  const [x, y] = key.split('/').map(Number);
  return decodeEdinburghOverview(bytes, x, y, edinburghCityOverviewZoom);
}
