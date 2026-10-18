import type { Map, RasterDEMSourceSpecification } from 'maplibre-gl';

export const terrainSourceId = 'neuk-terrain';
export const terrainOrigin = 'https://elevation-tiles-prod.s3.amazonaws.com';
export const terrainStorageKey = 'bike-neuk-map-3d';
export const terrainPitch = 55;

const terrainSource: RasterDEMSourceSpecification = {
  type: 'raster-dem',
  tiles: [`${terrainOrigin}/terrarium/{z}/{x}/{y}.png`],
  encoding: 'terrarium',
  tileSize: 256,
  maxzoom: 14,
  attribution:
    'Elevation: <a href="https://registry.opendata.aws/terrain-tiles/">Mapzen</a> · <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md">Terrain sources</a>',
};

/** Called again after style replacement; only 3D loads elevation tiles. */
export function syncMapTerrain(
  map: Pick<
    Map,
    'getSource' | 'addSource' | 'getTerrain' | 'setTerrain' | 'removeSource'
  >,
  enabled: boolean,
) {
  if (enabled) {
    if (!map.getSource(terrainSourceId)) {
      map.addSource(terrainSourceId, terrainSource);
    }
    if (map.getTerrain()?.source !== terrainSourceId) {
      map.setTerrain({ source: terrainSourceId, exaggeration: 1 });
    }
  } else {
    if (map.getTerrain()) map.setTerrain(null);
    if (map.getSource(terrainSourceId)) map.removeSource(terrainSourceId);
  }
}
