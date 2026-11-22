import type { FilterSpecification, Map, StyleLayer } from 'maplibre-gl';
import castleRockBounds from '@/data/castle-rock-bounds.json';
import {
  edinburghOverviewMinZoom,
  edinburghOverviewFullZoom,
  isLocalAerialPreview,
  isLocalEdinburghBuildingsPreview,
  isLocalEdinburghPilotPreview,
  isLocalLidarPreview,
  isLocalModeledFrontagePreview,
  isLocalShadedBuildingsPreview,
  localPrincesStreetRoofPreview,
} from './local-aerial-preview';
import {
  princesStreetFacadeCredit,
  princesStreetFacadeReferences,
} from './princes-street-facades';
import { princesStreetRoofPhotos } from './princes-street-roof-photo';

export const satelliteStorageKey = 'bike-neuk-map-satellite';
export const satelliteSourceId = 'neuk-satellite';
export const aerialBuildingsLayerId = 'neuk-aerial-buildings';
export const castleRockLayerId = 'neuk-castle-rock';
export const aerialBuildingFilter: FilterSpecification = [
  'all',
  ['!=', ['get', 'hide_3d'], true],
  ['>', ['number', ['get', 'render_height'], 0], 0],
];
export const satelliteOrigin = 'https://services.arcgisonline.com';
export const satelliteProtocol = 'neuk-satellite';
const endpoint = `${satelliteOrigin}/ArcGIS/rest/services/World_Imagery/MapServer/tile/`;
export const satelliteAttribution =
  'Imagery © <a href="https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9">Esri</a>, Vantor, Earthstar Geographics, and the GIS User Community';
const facadePhotoCredit =
  '<a href="https://commons.wikimedia.org/wiki/File:Waverly_Gate_or_Old_GPO.jpg">Waverley Gate photo</a> by SylviaStanley (cropped and rectified, <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>)';

export function addAerialBuildings(
  map: Map,
  edinburghCity = isLocalEdinburghBuildingsPreview(),
) {
  const { layers, sources } = map.getStyle();
  const imageryIndex = layers.findIndex(({ id }) => id === satelliteSourceId);
  // Both OpenFreeMap themes use this source. Reuse the same vector tiles.
  if (imageryIndex === -1 || sources.openmaptiles?.type !== 'vector') return;
  map.addLayer(
    {
      id: aerialBuildingsLayerId,
      type: 'fill-extrusion',
      source: 'openmaptiles',
      'source-layer': 'building',
      minzoom: 15,
      ...(edinburghCity ? { layout: { visibility: 'none' } } : {}),
      filter: aerialBuildingFilter,
      paint: {
        'fill-extrusion-color': '#aaa397',
        'fill-extrusion-opacity-transition': { duration: 0 },
        'fill-extrusion-height': ['number', ['get', 'render_height'], 0],
        'fill-extrusion-base': ['number', ['get', 'render_min_height'], 0],
      },
    },
    layers[imageryIndex + 1]?.id,
  );
  const layer = map.getLayer(aerialBuildingsLayerId);
  const removeCastleRock = edinburghCity ? addCastleRock(map) : undefined;
  const container = map.getContainer();
  container.dataset.mapAerialBuildings = 'on';
  return () => {
    removeCastleRock?.();
    if (layer && map.getLayer(aerialBuildingsLayerId) === layer) {
      map.removeLayer(aerialBuildingsLayerId);
    }
    delete container.dataset.mapAerialBuildings;
  };
}

function addCastleRock(map: Map) {
  const [west, south, east, north] = castleRockBounds;
  map.addSource(castleRockLayerId, {
    type: 'image',
    url: '/data/edinburgh-buildings/castle-rock.webp',
    coordinates: [
      [west, north],
      [east, north],
      [east, south],
      [west, south],
    ],
  });
  map.addLayer(
    {
      id: castleRockLayerId,
      type: 'raster',
      source: castleRockLayerId,
      minzoom: edinburghOverviewMinZoom,
      paint: {
        'raster-fade-duration': 0,
        'raster-opacity': [
          'interpolate',
          ['linear'],
          ['zoom'],
          edinburghOverviewMinZoom,
          0,
          edinburghOverviewFullZoom,
          1,
        ],
      },
    },
    aerialBuildingsLayerId,
  );
  const source = map.getSource(castleRockLayerId);
  const layer = map.getLayer(castleRockLayerId);
  return () => {
    if (!source || map.getSource(castleRockLayerId) !== source) return;
    if (layer && map.getLayer(castleRockLayerId) === layer) {
      map.removeLayer(castleRockLayerId);
    }
    if (!map.getLayer(castleRockLayerId)) map.removeSource(castleRockLayerId);
  };
}

/** Match Trail Atlas: missing detailed imagery falls back to parent tiles. */
export async function loadSatelliteTile(
  request: { url: string },
  controller: AbortController,
  fetchTile: typeof fetch = fetch,
) {
  const path = request.url.replace(`${satelliteProtocol}://`, '');
  const zoom = Number(path.split('/')[0]);
  let response: Response;
  try {
    response = await fetchTile(`${endpoint}${path}?blankTile=false`, {
      signal: controller.signal,
    });
  } catch (error) {
    // Esri's missing high-zoom tiles can omit CORS headers. MapLibre needs a
    // 404 to try a coarser parent; cancellations and overview failures propagate.
    if (
      !controller.signal.aborted &&
      error instanceof TypeError &&
      zoom >= 17
    ) {
      throw Object.assign(new Error('Detailed satellite tile unavailable'), {
        status: 404,
      });
    }
    throw error;
  }
  if (!response.ok) {
    throw Object.assign(new Error(`Satellite tile: ${response.status}`), {
      status: response.status,
    });
  }
  return {
    data: await response.arrayBuffer(),
    cacheControl: response.headers.get('cache-control'),
    expires: response.headers.get('expires'),
  };
}

/** Install imagery without replacing the style, camera, terrain or overlays. */
export function addSatelliteBasemap(
  map: Map,
  basemapLayerIds: readonly string[],
) {
  const baseLayers = map
    .getStyle()
    .layers.filter((layer) => basemapLayerIds.includes(layer.id));
  const originals: { layer: StyleLayer; restore: () => void }[] = [];
  const roofPreview = localPrincesStreetRoofPreview();
  const buildingPhotos = !isLocalShadedBuildingsPreview();
  map.addSource(satelliteSourceId, {
    type: 'raster',
    tiles: [`${satelliteProtocol}://{z}/{y}/{x}`],
    tileSize: 256,
    maxzoom: 19,
    attribution: [
      satelliteAttribution,
      buildingPhotos && isLocalAerialPreview() && facadePhotoCredit,
      buildingPhotos && isLocalLidarPreview() && princesStreetFacadeCredit,
      isLocalModeledFrontagePreview() && princesStreetFacadeReferences,
      isLocalModeledFrontagePreview() &&
        '<a href="/textures/princes-street-roof-detail.license.txt">Princes Street roof references</a>',
      !buildingPhotos &&
        !isLocalEdinburghBuildingsPreview() &&
        !isLocalEdinburghPilotPreview() &&
        '<a href="https://www.data.gov.uk/dataset/b2ad2bb5-d112-4b86-a0d6-6ec57d0ae3fb/lidar-for-scotland-phase-5-las">Princes Street laser returns</a> · Crown copyright Scottish Government, SEPA and Fugro (2021)',
      roofPreview && princesStreetRoofPhotos[roofPreview].credit,
    ]
      .filter(Boolean)
      .join(' · '),
  });
  map.addLayer(
    {
      id: satelliteSourceId,
      type: 'raster',
      source: satelliteSourceId,
      paint: {
        'raster-opacity': 0,
        'raster-opacity-transition': { duration: 0 },
      },
    },
    // Cycle-network lines can already sit below the first label. Imagery must
    // also go below those overlays, regardless of which layer was added first.
    map
      .getStyle()
      .layers.find(
        (layer) =>
          layer.type === 'symbol' || !basemapLayerIds.includes(layer.id),
      )?.id,
  );
  const source = map.getSource(satelliteSourceId);
  let shown = false;
  return {
    show() {
      if (shown || map.getSource(satelliteSourceId) !== source) return;
      shown = true;
      for (const spec of baseLayers) {
        const layer = map.getLayer(spec.id);
        if (!layer || spec.type === 'background') continue;
        if (spec.type === 'symbol') {
          if (!spec.layout?.['text-field']) continue;
          const paint = spec.paint;
          originals.push({
            layer,
            restore: () => {
              map.setPaintProperty(
                spec.id,
                'text-color',
                paint?.['text-color'],
              );
              map.setPaintProperty(
                spec.id,
                'text-halo-color',
                paint?.['text-halo-color'],
              );
              map.setPaintProperty(
                spec.id,
                'text-halo-width',
                paint?.['text-halo-width'],
              );
            },
          });
          map.setPaintProperty(spec.id, 'text-color', '#ffffff');
          map.setPaintProperty(spec.id, 'text-halo-color', '#172d29');
          map.setPaintProperty(spec.id, 'text-halo-width', 1.5);
        } else {
          originals.push({
            layer,
            restore: () => {
              map.setLayoutProperty(
                spec.id,
                'visibility',
                spec.layout?.visibility ?? 'visible',
              );
            },
          });
          map.setLayoutProperty(spec.id, 'visibility', 'none');
        }
      }
      map.setPaintProperty(satelliteSourceId, 'raster-opacity', 1);
    },
    remove(restoreStyle = true) {
      // A theme/recovery style may already have replaced these layers. Never
      // restore old paint into the new style, even when layer IDs are reused.
      for (const { layer, restore } of originals) {
        if (restoreStyle && map.getLayer(layer.id) === layer) restore();
      }
      if (map.getSource(satelliteSourceId) !== source) return;
      if (map.getLayer(satelliteSourceId)) map.removeLayer(satelliteSourceId);
      map.removeSource(satelliteSourceId);
    },
  };
}
