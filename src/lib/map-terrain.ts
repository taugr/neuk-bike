import type { Map, RasterDEMSourceSpecification } from 'maplibre-gl';
import {
  createLidarTerrainSource,
  lidarTerrainSourceId,
} from './waverley-lidar';

export const terrainSourceId = 'neuk-terrain';
export const terrainOrigin = 'https://elevation-tiles-prod.s3.amazonaws.com';
export const terrainStorageKey = 'bike-neuk-map-3d';
export const terrainPitch = 55;
export const terrainTransitionDuration = 800;

/** Keep a drag and its inertia on the same elevation plane. */
export function stabilizeTerrainPan(map: Map, reducedMotion: boolean) {
  let holdingElevation = false;
  const hold = () => {
    if (holdingElevation || !map.getCenterClampedToGround()) return;
    holdingElevation = true;
    map.setCenterClampedToGround(false);
  };
  const release = () => {
    if (!holdingElevation) return;
    holdingElevation = false;
    map.setCenterClampedToGround(true);
  };
  const settle = () => {
    // Let MapLibre finish its gesture before starting the elevation-only ease.
    if (!holdingElevation) return;
    queueMicrotask(() => {
      if (!holdingElevation || map.isMoving()) return;
      const elevation = map.queryTerrainElevation(map.getCenter());
      const needsEase =
        elevation != null &&
        Math.abs(elevation - map.getCenterElevation()) > 0.25;
      release();
      if (needsEase) map.easeTo({ duration: reducedMotion ? 0 : 480 });
    });
  };
  map.on('dragstart', hold);
  map.on('moveend', settle);
  return () => {
    map.off('dragstart', hold);
    map.off('moveend', settle);
    release();
  };
}

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
  lidar = false,
  edinburghCity = false,
) {
  const sourceId = lidar ? lidarTerrainSourceId : terrainSourceId;
  if (enabled) {
    if (!map.getSource(sourceId)) {
      map.addSource(
        sourceId,
        lidar
          ? createLidarTerrainSource(terrainSource, edinburghCity)
          : terrainSource,
      );
    }
    if (map.getTerrain()?.source !== sourceId) {
      map.setTerrain({ source: sourceId, exaggeration: 1 });
    }
  } else if (map.getTerrain()) {
    map.setTerrain(null);
  }
  for (const id of [terrainSourceId, lidarTerrainSourceId]) {
    if ((!enabled || id !== sourceId) && map.getSource(id))
      map.removeSource(id);
  }
}

/** Keep elevation changes out of the tilted camera's transition. */
export function transitionMapTerrain(
  map: Map,
  enabled: boolean,
  reducedMotion: boolean,
  lidar = false,
  edinburghCity = false,
) {
  const sourceId = lidar ? lidarTerrainSourceId : terrainSourceId;
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
    if (!map.getSource(sourceId) || !map.isSourceLoaded(sourceId)) return;
    map.off('render', tiltWhenReady);
    if (Math.abs(map.getPitch() - terrainPitch) > 0.01) {
      map.easeTo({ pitch: terrainPitch, duration });
    }
  };

  if (enabled) {
    map.setMaxPitch(60);
    syncMapTerrain(map, true, lidar, edinburghCity);
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
