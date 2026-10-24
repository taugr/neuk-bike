'use client';
import { useEffect, useRef } from 'react';
import type { Map as LibreMap } from 'maplibre-gl';
import { createRainRenderer } from '@/lib/rain-renderer';
import type { RainSnapshot } from '@/lib/rain';

export function RainMapOverlay({
  map,
  rain,
}: {
  map: LibreMap;
  rain: RainSnapshot;
}) {
  const renderer = useRef<ReturnType<typeof createRainRenderer> | null>(null);
  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.className = 'rain-map-canvas';
    canvas.dataset.testid = 'rain-map-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    map.getCanvasContainer().appendChild(canvas);
    renderer.current = createRainRenderer(map, canvas);
    return () => {
      renderer.current?.destroy();
      renderer.current = null;
      canvas.remove();
    };
  }, [map]);
  useEffect(() => {
    renderer.current?.update(rain);
  }, [map, rain]);
  return null;
}
