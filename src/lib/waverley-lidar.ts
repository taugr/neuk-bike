import type { RasterDEMSourceSpecification } from 'maplibre-gl';
import survey from '@/data/waverley-lidar.json';
import { edinburghTerrainTile } from './edinburgh-roof-survey';
import { edinburghCityTerrainTile } from './edinburgh-buildings';
import {
  isLocalEdinburghBuildingsPreview,
  isLocalEdinburghPilotPreview,
} from './local-aerial-preview';

export const lidarTerrainSourceId = 'neuk-waverley-terrain';
export const lidarProtocol = 'neuk-waverley-dem';
const assetRoot = '/data/waverley-lidar';
const lidarAttribution =
  '<a href="https://registry.opendata.aws/scottish-lidar/">Scottish Government LiDAR, Phase 5</a> · Crown copyright Scottish Government and Fugro (2020) · <a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/">OGL v3</a>';
const cityAttribution =
  'Building data © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> · City and <a href="https://www.edinburgh.gov.uk/conservation-2/conservation-areas">conservation boundaries</a> © City of Edinburgh Council, OGL v3 · <a href="/data/edinburgh-buildings/castle-sources.txt">Edinburgh Castle model sources</a>';

export function createLidarTerrainSource(
  base: RasterDEMSourceSpecification,
  edinburghCity = isLocalEdinburghBuildingsPreview(),
): RasterDEMSourceSpecification {
  return {
    ...base,
    tiles: [
      `${lidarProtocol}://${edinburghCity ? 'edinburgh/' : ''}{z}/{x}/{y}`,
    ],
    maxzoom: edinburghCity ? 16 : survey.maxZoom,
    attribution: [
      lidarAttribution,
      edinburghCity && cityAttribution,
      base.attribution,
    ]
      .filter(Boolean)
      .join(' · '),
  };
}

const tiles: Partial<Record<number, number[]>> = survey.demTiles;

export function getLidarTerrainTile(z: number, x: number, y: number) {
  const range = tiles[z];
  if (!range) return;
  const [west, north, east, south] = range;
  if (x >= west && x <= east && y >= north && y <= south)
    return `${assetRoot}/dem/${z}/${x}/${y}.png`;
}

export async function loadLidarTerrainTile(
  { url }: { url: string },
  { signal }: AbortController,
  terrainOrigin: string,
  fetchTile: typeof fetch = fetch,
) {
  const requestPath = url.slice(lidarProtocol.length + 3);
  const edinburghCity = requestPath.startsWith('edinburgh/');
  const path = edinburghCity
    ? requestPath.slice('edinburgh/'.length)
    : requestPath;
  const [z, x, y] = path.split('/').map(Number);
  const local = z > survey.baseZoom;
  const cityTile =
    local && (edinburghCity || isLocalEdinburghBuildingsPreview()) && z <= 16
      ? await edinburghCityTerrainTile(z, x, y).catch(() => undefined)
      : undefined;
  const pilotTile =
    local && isLocalEdinburghPilotPreview()
      ? edinburghTerrainTile(z, x, y)
      : undefined;
  const tile = local
    ? (cityTile ?? pilotTile ?? getLidarTerrainTile(z, x, y))
    : `${terrainOrigin}/terrarium/${path}.png`;
  // MapLibre keeps usable parent tiles when a detailed tile is unavailable.
  const missingDetail = () =>
    Object.assign(new Error('Waverley DEM detail unavailable'), {
      status: 404,
    });
  if (!tile) throw missingDetail();
  const response = await fetchTile(tile, { signal }).catch(
    async (error: unknown) => {
      if (!local || signal.aborted || !(error instanceof TypeError))
        throw error;
      // A local static server can drop a connection during a burst of tile
      // requests. Retry once before asking MapLibre for a coarser parent.
      try {
        return await fetchTile(tile, { signal });
      } catch (retryError) {
        if (signal.aborted) throw retryError;
        throw missingDetail();
      }
    },
  );
  if (!response.ok) {
    if (local) throw missingDetail();
    throw Object.assign(new Error(`Elevation tile: ${response.status}`), {
      status: response.status,
    });
  }
  return {
    data: await response.arrayBuffer(),
    cacheControl: response.headers.get('cache-control'),
    expires: response.headers.get('expires'),
  };
}
