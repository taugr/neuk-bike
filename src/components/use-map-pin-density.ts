'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Map } from 'maplibre-gl';
import type { ParkingPoint } from '@/lib/types';
import { selectScreenPins, type ScreenArea } from '@/lib/map-pin-density';

export function useMapPinDensity({
  map,
  points,
  protectedIds,
  enabled,
  getArea,
  layoutKey,
}: {
  map: Map | null;
  points: ParkingPoint[];
  protectedIds: ReadonlySet<string>;
  enabled: boolean;
  getArea: (map: Map) => ScreenArea;
  layoutKey: string;
}) {
  const previous = useRef<ReadonlySet<string>>(new Set());
  const [visibleIds, setVisibleIds] = useState<ReadonlySet<string>>(
    previous.current,
  );

  useEffect(() => {
    if (!map || !enabled) {
      previous.current = new Set();
      return;
    }
    let pending: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      clearTimeout(pending);
      pending = undefined;
      const next = selectScreenPins({
        pins: points.map((point) => ({
          id: point.id,
          ...map.project([point.longitude, point.latitude]),
          protected: protectedIds.has(point.id),
        })),
        area: getArea(map),
        zoom: map.getZoom(),
        pitch: map.getPitch(),
        previous: previous.current,
      });
      if (
        next.size === previous.current.size &&
        [...next].every((id) => previous.current.has(id))
      )
        return;
      previous.current = next;
      setVisibleIds(next);
    };
    const schedule = () => {
      // Projection is cheap; avoid rebuilding DOM markers on every touch frame.
      pending ??= setTimeout(update, 100);
    };
    update();
    map.on('move', schedule);
    map.on('moveend', update);
    map.on('resize', update);
    map.on('idle', update);
    return () => {
      clearTimeout(pending);
      map.off('move', schedule);
      map.off('moveend', update);
      map.off('resize', update);
      map.off('idle', update);
    };
  }, [map, enabled, points, protectedIds, getArea, layoutKey]);

  return useMemo(
    () =>
      enabled
        ? points.filter(
            (point) => protectedIds.has(point.id) || visibleIds.has(point.id),
          )
        : points,
    [enabled, points, protectedIds, visibleIds],
  );
}
