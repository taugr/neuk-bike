'use client';

import { useEffect, useRef, useState } from 'react';
import type { Map, ErrorEvent, MapSourceDataEvent } from 'maplibre-gl';
import { captureAnalyticsEvent } from '@/lib/analytics';
import { lidarTerrainSourceId } from '@/lib/waverley-lidar';
import { isLocalAerialPreview } from '@/lib/local-aerial-preview';
import {
  stabilizeTerrainPan,
  transitionMapTerrain,
  terrainOrigin,
  terrainSourceId,
  terrainStorageKey,
} from '@/lib/map-terrain';

type TerrainFailureReason =
  | 'offline'
  | 'basemap_unavailable'
  | 'tile_error'
  | 'startup_timeout'
  | 'setup_error';

export function useMapTerrain(
  map: Map | null,
  ready: boolean,
  styleRevision: number,
  offlineBasemap: boolean,
  lidar = false,
  edinburghCity = false,
) {
  // This hook lives in the client-only map. Restore before its first camera
  // is created, rather than animating from the default flat view after mount.
  const [enabled, setEnabled] = useState(() => {
    if (isLocalAerialPreview()) return true;
    try {
      return window.localStorage.getItem(terrainStorageKey) === 'true';
    } catch {
      return false;
    }
  });
  const [loaded, setLoaded] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const applied3dRef = useRef(false);

  useEffect(() => {
    setLoaded(false);
    if (!map || !ready) return;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let failed = false;
    let terrainReady = false;
    const activeSourceId = lidar ? lidarTerrainSourceId : terrainSourceId;
    let cancelTransition: (() => void) | undefined;
    let stopStabilizingPan: (() => void) | undefined;
    const fail = (reason: TerrainFailureReason) => {
      if (failed) return;
      failed = true;
      clearTimeout(timeout);
      setUnavailable(true);
      setEnabled(false);
      captureAnalyticsEvent('map_terrain_failed', {
        reason,
        terrain_source: lidar ? 'lidar' : 'global',
        terrain_ready: terrainReady,
      });
    };
    const onOffline = () => fail('offline');
    const onError = (event: ErrorEvent) => {
      const sourceId = 'sourceId' in event ? event.sourceId : undefined;
      const url = 'url' in event.error ? String(event.error.url) : '';
      if (sourceId === activeSourceId || url.startsWith(terrainOrigin))
        fail('tile_error');
    };
    const onSourceData = (event: MapSourceDataEvent) => {
      if (
        event.sourceId === activeSourceId &&
        event.tile &&
        event.isSourceLoaded
      ) {
        clearTimeout(timeout);
      }
    };
    const onRender = () => {
      if (
        map.getTerrain()?.source === activeSourceId &&
        map.isSourceLoaded(activeSourceId)
      ) {
        // This deadline applies only to the first usable terrain. A later
        // pan may briefly make the source unready while new tiles stream.
        clearTimeout(timeout);
        terrainReady = true;
        setLoaded(true);
        map.off('render', onRender);
      }
    };
    const active = enabled && !offlineBasemap && navigator.onLine;
    if (enabled && !active)
      fail(navigator.onLine ? 'basemap_unavailable' : 'offline');
    if (active) {
      map.on('error', onError);
      map.on('sourcedata', onSourceData);
      map.on('render', onRender);
      window.addEventListener('offline', onOffline);
      timeout = setTimeout(() => {
        if (!map.isSourceLoaded(activeSourceId)) fail('startup_timeout');
      }, 15_000);
    }
    try {
      // A failed first tile can arrive before the first animation frame. Cancel
      // the pending tilt even when the camera is still at the target 2D pitch.
      if (active || applied3dRef.current) map.stop();
      applied3dRef.current = active;
      const reducedMotion = window.matchMedia(
        '(prefers-reduced-motion: reduce)',
      ).matches;
      cancelTransition = transitionMapTerrain(
        map,
        active,
        reducedMotion,
        lidar,
        edinburghCity,
      );
      if (active && lidar && edinburghCity) {
        stopStabilizingPan = stabilizeTerrainPan(map, reducedMotion);
      }
    } catch {
      if (active) fail('setup_error');
    }
    return () => {
      clearTimeout(timeout);
      stopStabilizingPan?.();
      cancelTransition?.();
      map.off('error', onError);
      map.off('sourcedata', onSourceData);
      map.off('render', onRender);
      window.removeEventListener('offline', onOffline);
    };
  }, [
    map,
    ready,
    styleRevision,
    enabled,
    offlineBasemap,
    lidar,
    edinburghCity,
  ]);

  const toggle = () => {
    const next = !enabled;
    setUnavailable(false);
    setEnabled(next);
    try {
      window.localStorage.setItem(terrainStorageKey, String(next));
    } catch {
      // Private browsing or full storage must not prevent switching modes.
    }
  };

  return { enabled, loaded, unavailable, toggle };
}
