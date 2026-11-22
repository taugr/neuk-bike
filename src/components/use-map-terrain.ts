'use client';

import { useEffect, useRef, useState } from 'react';
import type { Map, ErrorEvent, MapSourceDataEvent } from 'maplibre-gl';
import { lidarTerrainSourceId } from '@/lib/waverley-lidar';
import { isLocalAerialPreview } from '@/lib/local-aerial-preview';
import {
  stabilizeTerrainPan,
  transitionMapTerrain,
  terrainOrigin,
  terrainSourceId,
  terrainStorageKey,
} from '@/lib/map-terrain';

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
    const activeSourceId = lidar ? lidarTerrainSourceId : terrainSourceId;
    let cancelTransition: (() => void) | undefined;
    let stopStabilizingPan: (() => void) | undefined;
    const fail = () => {
      if (failed) return;
      failed = true;
      clearTimeout(timeout);
      setUnavailable(true);
      setEnabled(false);
    };
    const onError = (event: ErrorEvent) => {
      const sourceId = 'sourceId' in event ? event.sourceId : undefined;
      const url = 'url' in event.error ? String(event.error.url) : '';
      if (sourceId === activeSourceId || url.startsWith(terrainOrigin)) fail();
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
        setLoaded(true);
        map.off('render', onRender);
      }
    };
    const active = enabled && !offlineBasemap && navigator.onLine;
    if (enabled && !active) fail();
    if (active) {
      map.on('error', onError);
      map.on('sourcedata', onSourceData);
      map.on('render', onRender);
      window.addEventListener('offline', fail);
      timeout = setTimeout(() => {
        if (!map.isSourceLoaded(activeSourceId)) fail();
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
      if (active) fail();
    }
    return () => {
      clearTimeout(timeout);
      stopStabilizingPan?.();
      cancelTransition?.();
      map.off('error', onError);
      map.off('sourcedata', onSourceData);
      map.off('render', onRender);
      window.removeEventListener('offline', fail);
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
