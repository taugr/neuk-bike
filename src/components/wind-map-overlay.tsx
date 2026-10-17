'use client';

import { useUnits } from './units-provider';
import { useLanguage } from './language-provider';
import { useEffect } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ArrowUp } from 'lucide-react';
import { Marker, type Map as MapLibreMap } from 'maplibre-gl';
import { windGridAnchors, windAnchorHasLabel } from '@/lib/wind-grid';
import {
  formatWindSpeed,
  formatWindTime,
  sampleWindAt,
  screenBearing,
  windDestination,
  windStatus,
  type WindForecast,
  type WindPoint,
} from '@/lib/wind';

const arrowMarkup = renderToStaticMarkup(
  <>
    <ArrowUp className="wind-arrow-halo" size={24} strokeWidth={6.5} />
    <ArrowUp className="wind-arrow-ink" size={24} strokeWidth={3} />
  </>,
);

export function WindMapOverlay({
  map,
  wind,
  label,
}: {
  map: MapLibreMap;
  wind: WindForecast;
  label: string;
}) {
  const { units } = useUnits();
  const { locale } = useLanguage();
  useEffect(() => {
    const status = windStatus(wind);
    if (status !== 'fresh' || (!wind.grid && wind.speed < 0.5)) return;
    const markers = new Map<
      string,
      {
        marker: Marker;
        point: WindPoint;
        element: HTMLSpanElement;
        sample: { speed: number; from: number };
      }
    >();
    // MapLibre owns translation synchronously with its camera. Never put
    // projection behind another RAF or a React render: that lags the canvas.
    const orient = () => {
      const occupied: { x: number; y: number }[] = [];
      for (const { point, element, sample } of markers.values()) {
        const position = map.project(point);
        const destination = windDestination(point, sample);
        const bearing = destination
          ? screenBearing(position, map.project(destination))
          : 0;
        element.dataset.bearing = (bearing ?? 0).toFixed(2);
        for (const svg of element.querySelectorAll('svg'))
          svg.style.transform = `rotate(${bearing ?? 0}deg)`;
        // Cull compressed labels during pitch/zoom; never shift their anchors.
        const collision = occupied.some(
          (p) =>
            Math.abs(p.x - position.x) < 90 && Math.abs(p.y - position.y) < 40,
        );
        element.style.visibility = collision ? 'hidden' : '';
        if (!collision) occupied.push(position);
      }
    };
    const reconcile = () => {
      const bounds = map.getBounds();
      const dx = bounds.getEast() - bounds.getWest();
      const dy = bounds.getNorth() - bounds.getSouth();
      // A generous offscreen buffer keeps nodes and grid density stable during
      // sustained drag/inertia. Only reconcile membership after the gesture.
      const anchors = windGridAnchors(
        {
          west: Math.max(bounds.getWest() - dx, wind.coverage.west),
          east: Math.min(bounds.getEast() + dx, wind.coverage.east),
          south: Math.max(bounds.getSouth() - dy, wind.coverage.south),
          north: Math.min(bounds.getNorth() + dy, wind.coverage.north),
        },
        map.getZoom(),
      );
      const retained = new Set(anchors.map((a) => a.id));
      for (const [id, entry] of markers)
        if (!retained.has(id)) {
          entry.marker.remove();
          markers.delete(id);
        }
      for (const { id, point } of anchors) {
        if (markers.has(id)) continue;
        const sample = sampleWindAt(wind, point);
        if ('status' in sample && sample.status === 'unsupported') continue;
        const variable = 'status' in sample && sample.status === 'variable';
        const element = document.createElement('span');
        element.className = 'wind-map-arrow';
        element.dataset.anchor = id;
        element.dataset.longitude = String(point[0]);
        element.dataset.latitude = String(point[1]);
        element.setAttribute('aria-hidden', 'true');
        element.dataset.speed = String(sample.speed);
        element.dataset.from = String(sample.from);
        element.dataset.estimate = variable
          ? 'variable'
          : sample.speed < 0.5
            ? 'calm'
            : 'estimated';
        element.innerHTML = variable
          ? '↔'
          : sample.speed < 0.5
            ? '·'
            : arrowMarkup;
        if (windAnchorHasLabel(id, map.getContainer().clientWidth <= 820)) {
          const speed = document.createElement('span');
          speed.className = 'wind-map-speed';
          speed.textContent = variable
            ? 'Variable'
            : formatWindSpeed(sample.speed, units, locale);
          element.append(speed);
        }
        const marker = new Marker({
          element,
          anchor: 'center',
          subpixelPositioning: true,
        })
          .setLngLat(point)
          .addTo(map);
        markers.set(id, { marker, element, point, sample });
      }
      orient();
    };
    reconcile();
    map.on('moveend', reconcile);
    map.on('resize', reconcile);
    // Ordinary panning needs only MapLibre's native marker translation.
    map.on('rotate', orient);
    map.on('pitch', orient);
    map.on('zoom', orient);
    return () => {
      map.off('moveend', reconcile);
      map.off('resize', reconcile);
      map.off('rotate', orient);
      map.off('pitch', orient);
      map.off('zoom', orient);
      for (const { marker } of markers.values()) marker.remove();
    };
  }, [map, wind, units, locale]);
  return (
    <div
      className="sr-only"
      data-testid="wind-overlay"
      role="img"
      aria-label={
        wind.grid
          ? `${label} · blank areas: no supported estimate · speeds in ${units === 'imperial' ? 'miles per hour' : 'kilometres per hour'}`
          : `${label} · ${formatWindSpeed(wind.speed, units, locale)}`
      }
    >
      <span>
        {wind.grid?.model === 'best_match' ? (
          <>
            {label}
            <br />
            Regional samples · arrows show air
          </>
        ) : wind.grid ? (
          <>
            {formatWindTime(wind.validAt)}
            <br />
            UKV ~{units === 'imperial' ? '1.2 mi' : '2 km'} forecast
            {label.includes('cached') ? ' · cached' : ''}
            <br />
            {units === 'imperial' ? '2.5–3.7 mi' : '4–6 km'} samples · arrows
            show air
          </>
        ) : (
          label
        )}
      </span>
    </div>
  );
}
