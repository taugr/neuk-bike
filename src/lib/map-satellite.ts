import type { Map, StyleLayer } from 'maplibre-gl';

export const satelliteStorageKey = 'bike-neuk-map-satellite';
export const satelliteSourceId = 'neuk-satellite';
export const satelliteOrigin = 'https://services.arcgisonline.com';
export const satelliteProtocol = 'neuk-satellite';
const endpoint = `${satelliteOrigin}/ArcGIS/rest/services/World_Imagery/MapServer/tile/`;
export const satelliteAttribution =
  'Imagery © <a href="https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9">Esri</a>, Vantor, Earthstar Geographics, and the GIS User Community';

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
  map.addSource(satelliteSourceId, {
    type: 'raster',
    tiles: [`${satelliteProtocol}://{z}/{y}/{x}`],
    tileSize: 256,
    maxzoom: 19,
    attribution: satelliteAttribution,
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
