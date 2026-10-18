'use client';

import { useEffect, useRef, useState } from 'react';
import type { Map, ErrorEvent, MapSourceDataEvent } from 'maplibre-gl';
import {
  syncMapTerrain,
  terrainOrigin,
  terrainPitch,
  terrainSourceId,
  terrainStorageKey,
} from '@/lib/map-terrain';

export function useMapTerrain(
  map: Map | null,
  ready: boolean,
  styleRevision: number,
  offlineBasemap: boolean,
) {
  const [enabled, setEnabled] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const applied3dRef = useRef(false);

  useEffect(() => {
    try {
      setEnabled(window.localStorage.getItem(terrainStorageKey) === 'true');
    } catch {
      // Storage is optional; the control still works for this session.
    }
  }, []);

  useEffect(() => {
    if (!map || !ready) return;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let failed = false;
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
      if (sourceId === terrainSourceId || url.startsWith(terrainOrigin)) fail();
    };
    const onSourceData = (event: MapSourceDataEvent) => {
      if (
        event.sourceId === terrainSourceId &&
        event.tile &&
        event.isSourceLoaded
      ) {
        clearTimeout(timeout);
      }
    };
    const active = enabled && !offlineBasemap && navigator.onLine;
    if (enabled && !active) fail();
    if (active) {
      map.on('error', onError);
      map.on('sourcedata', onSourceData);
      window.addEventListener('offline', fail);
      timeout = setTimeout(() => {
        if (!map.isSourceLoaded(terrainSourceId)) fail();
      }, 15_000);
    }
    try {
      // A failed first tile can arrive before the first animation frame. Cancel
      // the pending tilt even when the camera is still at the target 2D pitch.
      if (active || applied3dRef.current) map.stop();
      applied3dRef.current = active;
      syncMapTerrain(map, active);
      const pitch = active ? terrainPitch : 0;
      if (
        active ? Math.abs(map.getPitch() - pitch) > 0.01 : map.getPitch() !== 0
      ) {
        map.easeTo({
          pitch,
          duration: window.matchMedia('(prefers-reduced-motion: reduce)')
            .matches
            ? 0
            : 500,
        });
      }
    } catch {
      if (active) fail();
    }
    return () => {
      clearTimeout(timeout);
      map.off('error', onError);
      map.off('sourcedata', onSourceData);
      window.removeEventListener('offline', fail);
    };
  }, [map, ready, styleRevision, enabled, offlineBasemap]);

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

  return { enabled, unavailable, toggle };
}
