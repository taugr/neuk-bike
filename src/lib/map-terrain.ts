import type { Map, RasterDEMSourceSpecification } from 'maplibre-gl';

export const terrainSourceId = 'neuk-terrain';
export const terrainOrigin = 'https://elevation-tiles-prod.s3.amazonaws.com';
export const terrainStorageKey = 'bike-neuk-map-3d';
export const terrainPitch = 55;
export const terrainTransitionDuration = 800;

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

/** Keep elevation changes out of the tilted camera's transition. */
export function transitionMapTerrain(
  map: Map,
  enabled: boolean,
  reducedMotion: boolean,
) {
  const duration = reducedMotion ? 0 : terrainTransitionDuration;
  const finishFlat = () => {
    // A route fit or user gesture can interrupt the animation. Only detach
    // once the camera actually reaches flat, including on a later moveend.
    if (map.getPitch() !== 0) return;
    map.off('moveend', finishFlat);
    map.setMaxPitch(0);
    syncMapTerrain(map, false);
  };
  const tiltWhenReady = () => {
    if (!map.getSource(terrainSourceId) || !map.isSourceLoaded(terrainSourceId))
      return;
    map.off('render', tiltWhenReady);
    if (Math.abs(map.getPitch() - terrainPitch) > 0.01) {
      map.easeTo({ pitch: terrainPitch, duration });
    }
  };

  if (enabled) {
    map.setMaxPitch(60);
    syncMapTerrain(map, true);
    // Wait for a rendered frame with loaded DEM tiles. Starting the tilt in
    // sourcedata races MapLibre's elevation/camera update for that tile.
    map.on('render', tiltWhenReady);
    map.triggerRepaint();
  } else if (map.getPitch() !== 0) {
    map.on('moveend', finishFlat);
    map.easeTo({ pitch: 0, duration });
  } else {
    finishFlat();
  }

  return () => {
    map.off('render', tiltWhenReady);
    map.off('moveend', finishFlat);
  };
}
