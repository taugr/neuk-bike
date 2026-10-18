'use client';

import { useEffect, useState, type RefObject } from 'react';
import type { Map, ErrorEvent, MapSourceDataEvent } from 'maplibre-gl';
import {
  addSatelliteBasemap,
  satelliteOrigin,
  satelliteSourceId,
} from '@/lib/map-satellite';

export function useMapSatellite(
  map: Map | null,
  ready: boolean,
  styleRevision: number,
  offlineBasemap: boolean,
  enabled: boolean,
  basemapLayerIds: RefObject<readonly string[]>,
  onUnavailable: () => void,
) {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setLoaded(false);
    if (!map || !ready || !enabled) return;
    if (offlineBasemap || !navigator.onLine) {
      onUnavailable();
      return;
    }
    const baseIds = basemapLayerIds.current;
    let disposed = false;
    let hasTile = false;
    let imagery: ReturnType<typeof addSatelliteBasemap> | undefined;
    const fail = () => {
      if (disposed) return;
      onUnavailable();
    };
    const timeout = setTimeout(fail, 15_000);
    const onError = (event: ErrorEvent) => {
      const sourceId = 'sourceId' in event ? event.sourceId : undefined;
      const url = 'url' in event.error ? String(event.error.url) : '';
      if (sourceId !== satelliteSourceId && !url.startsWith(satelliteOrigin))
        return;
      if ('status' in event.error && event.error.status === 404) return;
      fail();
    };
    const onSourceData = (event: MapSourceDataEvent) => {
      if (
        event.sourceId === satelliteSourceId &&
        event.tile?.state === 'loaded'
      )
        hasTile = true;
    };
    const onRender = () => {
      if (
        !hasTile ||
        !map.getSource(satelliteSourceId) ||
        !map.isSourceLoaded(satelliteSourceId)
      )
        return;
      clearTimeout(timeout);
      imagery?.show();
      setLoaded(true);
      map.off('render', onRender);
    };
    map.on('error', onError);
    map.on('sourcedata', onSourceData);
    map.on('render', onRender);
    window.addEventListener('offline', fail);
    try {
      imagery = addSatelliteBasemap(map, baseIds);
    } catch {
      fail();
    }
    return () => {
      disposed = true;
      clearTimeout(timeout);
      map.off('error', onError);
      map.off('sourcedata', onSourceData);
      map.off('render', onRender);
      window.removeEventListener('offline', fail);
      imagery?.remove(basemapLayerIds.current === baseIds);
    };
  }, [
    map,
    ready,
    styleRevision,
    offlineBasemap,
    enabled,
    basemapLayerIds,
    onUnavailable,
  ]);
  return loaded;
}
