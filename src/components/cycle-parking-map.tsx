'use client';

import maplibregl from 'maplibre-gl';
import type {
  FilterSpecification,
  GeoJSONSource,
  LineLayerSpecification,
  Map as MapLibreMap,
  Marker as MapLibreMarker,
  PaddingOptions,
  Popup as MapLibrePopup,
  StyleSpecification,
} from 'maplibre-gl';
import {
  Bike,
  Boxes,
  Building2,
  CircleHelp,
  GraduationCap,
  Lock,
  LockOpen,
  MapPin,
  Navigation,
  ScanSearch,
  ParkingCircle,
  Route,
  Share2,
  ShoppingBag,
  Umbrella,
  UmbrellaOff,
  Warehouse,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import type { ParkingPoint, UserLocation } from '@/lib/types';
import { getParkingPopupDetails } from '@/lib/parking';
import type { ParkingPopupIcon } from '@/lib/parking';
import type { CycleRoute, CycleRoutePoint } from '@/lib/cyclestreets';
import {
  getRouteInstructionManeuver,
  type RouteInstructionManeuver,
} from '@/lib/route-instructions';
import {
  getRenderableParkingPoints,
  type ParkingMapBounds,
} from '@/lib/map-pins';

type CycleParkingMapProps = {
  points: ParkingPoint[];
  userLocation: UserLocation;
  currentLocationFocusRequestId: number;
  selectedPoint: ParkingPoint | null;
  nearestPoint: ParkingPoint | null;
  rankedPoints: ParkingPoint[];
  route: CycleRoute | null;
  routeInstructionFocusRequest: {
    id: string;
    requestId: number;
  } | null;
  liveRouteMarker: {
    headingDegrees: number | null;
    isOffRoute: boolean;
    position: CycleRoutePoint;
    updatedAt: number;
  } | null;
  shouldFollowLiveRoute: boolean;
  isDirectionsMode: boolean;
  mobileSheetState: 'collapsed' | 'expanded';
  copiedShareButton: { parkingId: string; source: 'list' | 'popup' } | null;
  theme: 'light' | 'dark';
  canRequestDirections: boolean;
  canShowStreetView: boolean;
  onSelectPoint: (id: string) => void;
  onRequestDirections: (point: ParkingPoint) => void;
  onOpenStreetView: (point: ParkingPoint) => void;
  onCopyParkingLink: (point: ParkingPoint) => void;
};

type VisibleMapArea = {
  bottom: number;
  center: { x: number; y: number };
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
};

type RenderedMarker = {
  marker: MapLibreMarker;
  popup?: MapLibrePopup;
  popupRoot?: Root;
};

type LineLayerStyle = {
  color: string;
  dashArray?: number[];
  opacity: number;
  width: number;
};

type RouteLineData = {
  features: {
    geometry: {
      coordinates: [number, number][];
      type: 'LineString';
    };
    properties: Record<string, never>;
    type: 'Feature';
  }[];
  type: 'FeatureCollection';
};

const defaultCenter: CycleRoutePoint = [55.9533, -3.1883];
const mapLibreBasemapStyleUrl = 'https://tiles.openfreemap.org/styles/liberty';
const mapLibreShieldLayerIds = new Set([
  'highway-shield-non-us',
  'highway-shield-us-interstate',
  'road_shield_us',
]);
const highlightedRankCount = 3;
const rankedPointCount = 8;
const popupIconByName: Record<ParkingPopupIcon, LucideIcon> = {
  'access-open': LockOpen,
  building: Building2,
  covered: Umbrella,
  customer: ShoppingBag,
  distance: Route,
  fixture: Boxes,
  'not-covered': UmbrellaOff,
  parking: ParkingCircle,
  restricted: Lock,
  stand: Bike,
  storage: Warehouse,
  university: GraduationCap,
  unknown: CircleHelp,
};

function toLngLat(point: CycleRoutePoint): [number, number] {
  return [point[1], point[0]];
}

function patchOpenFreeMapLibertyStyle(
  style: StyleSpecification,
): StyleSpecification {
  return {
    ...style,
    layers: style.layers.map((layer) => {
      if (!mapLibreShieldLayerIds.has(layer.id)) {
        return layer;
      }

      const existingFilter = 'filter' in layer ? layer.filter : undefined;

      return {
        ...layer,
        filter: [
          'all',
          ['!=', ['get', 'ref_length'], null],
          ...(existingFilter ? [existingFilter] : []),
        ] as FilterSpecification,
      };
    }),
  };
}

async function loadMapLibreBasemapStyle(signal: AbortSignal) {
  const response = await fetch(mapLibreBasemapStyleUrl, { signal });

  if (!response.ok) {
    throw new Error(`Map style request failed with ${response.status}`);
  }

  return patchOpenFreeMapLibertyStyle(
    (await response.json()) as StyleSpecification,
  );
}

function userLocationToPoint(userLocation: UserLocation): CycleRoutePoint {
  return [userLocation.latitude, userLocation.longitude];
}

function parkingPointToRoutePoint(point: ParkingPoint): CycleRoutePoint {
  return [point.latitude, point.longitude];
}

function getMapSize(map: MapLibreMap) {
  const container = map.getContainer();

  return {
    x: container.clientWidth,
    y: container.clientHeight,
  };
}

function getVisibleMapArea(map: MapLibreMap): VisibleMapArea {
  const mapElement = map.getContainer();
  const size = getMapSize(map);
  const fallbackArea = {
    bottom: size.y,
    center: { x: size.x / 2, y: size.y / 2 },
    height: size.y,
    left: 0,
    right: size.x,
    top: 0,
    width: size.x,
  };
  const controlPane = document.querySelector<HTMLElement>('.control-pane');

  if (!controlPane) {
    return fallbackArea;
  }

  const mapRect = mapElement.getBoundingClientRect();
  const controlPaneRect = controlPane.getBoundingClientRect();
  const overlapLeft = Math.max(mapRect.left, controlPaneRect.left);
  const overlapRight = Math.min(mapRect.right, controlPaneRect.right);
  const overlapTop = Math.max(mapRect.top, controlPaneRect.top);
  const overlapBottom = Math.min(mapRect.bottom, controlPaneRect.bottom);
  const horizontalOverlap = Math.round(overlapRight - overlapLeft);
  const verticalOverlap = Math.round(overlapBottom - overlapTop);

  if (horizontalOverlap <= 0 || verticalOverlap <= 0) {
    return fallbackArea;
  }

  let left = 0;
  let right = size.x;
  let top = 0;
  let bottom = size.y;
  const minVisibleWidth = Math.min(160, Math.round(size.x * 0.5));
  const minVisibleHeight = Math.min(160, Math.round(size.y * 0.5));

  if (
    horizontalOverlap > size.x * 0.5 &&
    controlPaneRect.top > mapRect.top &&
    controlPaneRect.top < mapRect.bottom
  ) {
    bottom = Math.max(
      minVisibleHeight,
      Math.round(controlPaneRect.top - mapRect.top),
    );
  } else if (
    horizontalOverlap > size.x * 0.5 &&
    controlPaneRect.bottom > mapRect.top &&
    controlPaneRect.bottom < mapRect.bottom
  ) {
    top = Math.min(
      size.y - minVisibleHeight,
      Math.round(controlPaneRect.bottom - mapRect.top),
    );
  } else if (
    verticalOverlap > size.y * 0.5 &&
    controlPaneRect.left > mapRect.left &&
    controlPaneRect.left < mapRect.right
  ) {
    right = Math.max(
      minVisibleWidth,
      Math.round(controlPaneRect.left - mapRect.left),
    );
  } else if (
    verticalOverlap > size.y * 0.5 &&
    controlPaneRect.right > mapRect.left &&
    controlPaneRect.right < mapRect.right
  ) {
    left = Math.min(
      size.x - minVisibleWidth,
      Math.round(controlPaneRect.right - mapRect.left),
    );
  }

  const width = right - left;
  const height = bottom - top;

  return {
    bottom,
    center: { x: left + width / 2, y: top + height / 2 },
    height,
    left,
    right,
    top,
    width,
  };
}

function centerPopupInVisibleMapArea(map: MapLibreMap, popup: MapLibrePopup) {
  if (!popup.isOpen()) {
    return;
  }

  const popupElement = popup.getElement();

  if (!popupElement) {
    return;
  }

  const mapRect = map.getContainer().getBoundingClientRect();
  const visibleArea = getVisibleMapArea(map);
  const visibleCenterX = mapRect.left + visibleArea.center.x;
  const visibleCenterY = mapRect.top + visibleArea.center.y;
  const popupRect = popupElement.getBoundingClientRect();
  const popupCenterX = (popupRect.left + popupRect.right) / 2;
  const popupCenterY = (popupRect.top + popupRect.bottom) / 2;
  const panX = Math.round(popupCenterX - visibleCenterX);
  const panY = Math.round(popupCenterY - visibleCenterY);

  if (Math.abs(panX) < 12 && Math.abs(panY) < 12) {
    return;
  }

  map.panBy([panX, panY], {
    duration: 650,
    easing: (progress) => progress * (2 - progress),
  });
}

function getFocusPadding(map: MapLibreMap): PaddingOptions {
  const visibleArea = getVisibleMapArea(map);
  const size = getMapSize(map);
  const coveredLeft = visibleArea.left;
  const coveredRight = size.x - visibleArea.right;
  const coveredTop = visibleArea.top;
  const coveredBottom = size.y - visibleArea.bottom;

  return {
    bottom: 40 + coveredBottom,
    left: 40 + coveredLeft,
    right: 40 + coveredRight,
    top: 40 + coveredTop,
  };
}

function getMapPointFocusCenter(
  map: MapLibreMap,
  point: CycleRoutePoint,
  zoom: number,
  mobileSheetState: 'collapsed' | 'expanded',
): [number, number] {
  const size = getMapSize(map);
  const visibleArea = getVisibleMapArea(map);

  if (
    visibleArea.left === 0 &&
    visibleArea.top === 0 &&
    visibleArea.right === size.x &&
    visibleArea.bottom === size.y
  ) {
    return toLngLat(point);
  }

  const targetY =
    mobileSheetState === 'collapsed'
      ? Math.round(visibleArea.top + visibleArea.height * 0.62)
      : Math.min(
          Math.max(visibleArea.top + 48, visibleArea.bottom - 56),
          Math.max(
            visibleArea.top + 180,
            Math.round(visibleArea.top + visibleArea.height * 0.75),
          ),
        );
  const targetPoint = {
    x: visibleArea.center.x,
    y: targetY,
  };
  const mapCenterPoint = { x: size.x / 2, y: size.y / 2 };
  const projectedPoint = map.project(toLngLat(point));
  const projectedCenter = {
    x: projectedPoint.x - (targetPoint.x - mapCenterPoint.x),
    y: projectedPoint.y - (targetPoint.y - mapCenterPoint.y),
  };
  const center = map.unproject([projectedCenter.x, projectedCenter.y]);

  return [center.lng, center.lat];
}

function isPointInVisibleMapArea(map: MapLibreMap, point: CycleRoutePoint) {
  const visibleArea = getVisibleMapArea(map);
  const projectedPoint = map.project(toLngLat(point));
  const insetX = Math.min(32, visibleArea.width * 0.18);
  const insetY = Math.min(32, visibleArea.height * 0.18);

  return (
    projectedPoint.x >= visibleArea.left + insetX &&
    projectedPoint.x <= visibleArea.right - insetX &&
    projectedPoint.y >= visibleArea.top + insetY &&
    projectedPoint.y <= visibleArea.bottom - insetY
  );
}

function getVisibleMapBounds(map: MapLibreMap): ParkingMapBounds {
  const visibleArea = getVisibleMapArea(map);
  const northWest = map.unproject([visibleArea.left, visibleArea.top]);
  const southEast = map.unproject([visibleArea.right, visibleArea.bottom]);

  return {
    east: southEast.lng,
    north: northWest.lat,
    south: southEast.lat,
    west: northWest.lng,
  };
}

function getDistanceMeters(a: CycleRoutePoint, b: CycleRoutePoint) {
  const earthRadiusMeters = 6_371_000;
  const lat1 = (a[0] * Math.PI) / 180;
  const lat2 = (b[0] * Math.PI) / 180;
  const deltaLat = ((b[0] - a[0]) * Math.PI) / 180;
  const deltaLng = ((b[1] - a[1]) * Math.PI) / 180;
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  const centralAngle =
    2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));

  return earthRadiusMeters * centralAngle;
}

function createBounds(points: CycleRoutePoint[]) {
  const bounds = new maplibregl.LngLatBounds();

  points.forEach((point) => bounds.extend(toLngLat(point)));

  return bounds;
}

function createMarkerElement(className: string, label = '') {
  const element = document.createElement('div');
  const span = document.createElement('span');
  element.className = className;
  span.textContent = label;
  element.append(span);

  return element;
}

function createParkingMarkerElement(
  kind: 'default' | 'selected' | 'selected-ranked',
  label = '',
) {
  return createMarkerElement(`parking-marker parking-marker-${kind}`, label);
}

function createRankedParkingMarkerElement(rank: number) {
  return createMarkerElement(
    `parking-marker parking-marker-ranked parking-marker-rank-${rank}`,
    String(rank),
  );
}

function createPinMarkerElement(className: string) {
  return createMarkerElement(className);
}

function createLiveRouteMarkerElement({
  headingDegrees,
  isOffRoute,
}: {
  headingDegrees: number | null;
  isOffRoute: boolean;
}) {
  const element = document.createElement('div');
  const span = document.createElement('span');
  const headingCue =
    headingDegrees === null
      ? ''
      : `<i class="live-route-heading" style="transform: translateX(-50%) rotate(${headingDegrees}deg)" aria-hidden="true"></i>`;

  element.className = isOffRoute
    ? 'live-route-marker live-route-marker-off-route'
    : 'live-route-marker';
  span.innerHTML = `${headingCue}<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><circle cx="18.5" cy="17.5" r="3.5"></circle><circle cx="5.5" cy="17.5" r="3.5"></circle><circle cx="15" cy="5" r="1"></circle><path d="m12 17.5 3-6 2 3h2"></path><path d="m5.5 17.5 3-6h4l3 6"></path><path d="m8.5 11.5 2-4h3.5"></path></svg>`;
  element.append(span);

  return element;
}

function getSelectedInstructionMarkerSvg(maneuver: RouteInstructionManeuver) {
  if (maneuver === 'start') {
    return '<path d="M5 19V5"></path><path d="m5 5 12 3-12 3"></path>';
  }

  if (maneuver === 'arrive') {
    return '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"></path><circle cx="12" cy="10" r="3"></circle>';
  }

  if (maneuver === 'left') {
    return '<path d="M15 18v-6a4 4 0 0 0-4-4H5"></path><path d="m8 5-3 3 3 3"></path>';
  }

  if (maneuver === 'right') {
    return '<path d="M9 18v-6a4 4 0 0 1 4-4h6"></path><path d="m16 5 3 3-3 3"></path>';
  }

  return '<path d="M12 19V5"></path><path d="m5 12 7-7 7 7"></path>';
}

function createSelectedInstructionMarkerElement(
  maneuver: RouteInstructionManeuver,
) {
  const element = document.createElement('div');
  const span = document.createElement('span');
  element.className = `selected-route-instruction-marker selected-route-instruction-marker-${maneuver}`;
  span.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.4">${getSelectedInstructionMarkerSvg(maneuver)}</svg>`;
  element.append(span);

  return element;
}

function ParkingPopupIcon({ icon }: { icon: ParkingPopupIcon }) {
  const Icon = popupIconByName[icon] ?? MapPin;

  return <Icon size={15} strokeWidth={2.25} aria-hidden="true" />;
}

function ParkingPopupContent({
  canRequestDirections,
  canShowStreetView,
  copiedShareButton,
  isDirectionsMode,
  onCopyParkingLink,
  onOpenStreetView,
  onRequestDirections,
  point,
}: {
  canRequestDirections: boolean;
  canShowStreetView: boolean;
  copiedShareButton: { parkingId: string; source: 'list' | 'popup' } | null;
  isDirectionsMode: boolean;
  onCopyParkingLink: (point: ParkingPoint) => void;
  onOpenStreetView: (point: ParkingPoint) => void;
  onRequestDirections: (point: ParkingPoint) => void;
  point: ParkingPoint;
}) {
  const popupDetails = getParkingPopupDetails(point);

  return (
    <div className="parking-popup">
      <div className="parking-popup-title-row">
        <strong>{point.name}</strong>
        {popupDetails.metrics.map((metric) => (
          <span
            className="parking-popup-distance"
            key={metric.label}
            title={metric.label}
          >
            {metric.value}
          </span>
        ))}
      </div>
      <div
        className={`parking-popup-details parking-popup-details-count-${popupDetails.details.length}`}
        aria-label="Parking details"
      >
        {popupDetails.details.map((detail) => (
          <div
            aria-label={`${detail.label}: ${detail.value}`}
            className={`parking-popup-detail parking-popup-tone-${detail.tone}`}
            key={detail.label}
          >
            <span className="parking-popup-detail-icon">
              {detail.emphasis ?? <ParkingPopupIcon icon={detail.icon} />}
            </span>
            <span className="parking-popup-detail-value">{detail.value}</span>
          </div>
        ))}
      </div>
      {isDirectionsMode ? null : (
        <div className="parking-popup-actions">
          <button
            className="parking-popup-directions-button"
            disabled={!canRequestDirections}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onRequestDirections(point);
            }}
          >
            <Navigation size={15} aria-hidden="true" />
            Directions
          </button>
          {canShowStreetView ? (
            <button
              aria-label={`Open Street View for ${point.name}`}
              className="parking-popup-street-view-button"
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onOpenStreetView(point);
              }}
            >
              <ScanSearch size={15} aria-hidden="true" />
              Street
            </button>
          ) : null}
          <button
            aria-label={`Copy link to ${point.name}`}
            className="parking-popup-share-button"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onCopyParkingLink(point);
            }}
          >
            <Share2 size={15} aria-hidden="true" />
            Share
            {copiedShareButton?.source === 'popup' &&
            copiedShareButton.parkingId === point.id ? (
              <span className="parking-popup-share-feedback" role="status">
                Copied
              </span>
            ) : null}
          </button>
        </div>
      )}
    </div>
  );
}

function StartPopupContent() {
  return (
    <div className="parking-popup">
      <strong>Start position</strong>
      <span>Current location</span>
    </div>
  );
}

function createRenderedPopup(
  content: ReactNode,
  options: maplibregl.PopupOptions = {},
) {
  const container = document.createElement('div');
  const root = createRoot(container);
  root.render(content);

  return {
    popup: new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      focusAfterOpen: false,
      maxWidth: '340px',
      ...options,
    }).setDOMContent(container),
    root,
  };
}

function cleanupRenderedMarker(renderedMarker: RenderedMarker | null) {
  if (!renderedMarker) {
    return;
  }

  renderedMarker.popup?.remove();
  renderedMarker.marker.remove();
  renderedMarker.popupRoot?.unmount();
}

function getFinalApproachPositions(
  route: CycleRoute | null,
  selectedPoint: ParkingPoint | null,
): CycleRoutePoint[] | null {
  const routeEnd = route?.points.at(-1);

  if (!routeEnd || !selectedPoint) {
    return null;
  }

  const destination = parkingPointToRoutePoint(selectedPoint);
  const distanceMeters = getDistanceMeters(routeEnd, destination);

  if (distanceMeters < 2) {
    return null;
  }

  return [routeEnd, destination];
}

function getInitialApproachPositions(
  route: CycleRoute | null,
  userLocation: UserLocation,
): CycleRoutePoint[] | null {
  const routeStart = route?.points.at(0);

  if (!routeStart) {
    return null;
  }

  const start = userLocationToPoint(userLocation);
  const distanceMeters = getDistanceMeters(start, routeStart);

  if (distanceMeters < 2) {
    return null;
  }

  return [start, routeStart];
}

function createLineData(positions: CycleRoutePoint[] | null): RouteLineData {
  return {
    features: positions
      ? [
          {
            geometry: {
              coordinates: positions.map(toLngLat),
              type: 'LineString',
            },
            properties: {},
            type: 'Feature',
          },
        ]
      : [],
    type: 'FeatureCollection',
  };
}

function syncLineLayer({
  data,
  id,
  map,
  style,
}: {
  data: RouteLineData;
  id: string;
  map: MapLibreMap;
  style: LineLayerStyle;
}) {
  const layerId = `${id}-layer`;
  const source = map.getSource(id) as GeoJSONSource | undefined;

  if (source) {
    source.setData(data);
  } else {
    map.addSource(id, {
      data,
      type: 'geojson',
    });
  }

  if (map.getLayer(layerId)) {
    map.setPaintProperty(layerId, 'line-color', style.color);
    map.setPaintProperty(layerId, 'line-opacity', style.opacity);
    map.setPaintProperty(layerId, 'line-width', style.width);
    map.setPaintProperty(layerId, 'line-dasharray', style.dashArray ?? [1, 0]);
    return;
  }

  const paint: NonNullable<LineLayerSpecification['paint']> = {
    'line-color': style.color,
    'line-opacity': style.opacity,
    'line-width': style.width,
  };

  if (style.dashArray) {
    paint['line-dasharray'] = style.dashArray;
  }

  map.addLayer({
    id: layerId,
    layout: {
      'line-cap': 'round',
      'line-join': 'round',
    },
    paint,
    source: id,
    type: 'line',
  });
}

export default function CycleParkingMap({
  points,
  userLocation,
  currentLocationFocusRequestId,
  selectedPoint,
  nearestPoint,
  rankedPoints,
  route,
  routeInstructionFocusRequest,
  liveRouteMarker,
  shouldFollowLiveRoute,
  isDirectionsMode,
  mobileSheetState,
  copiedShareButton,
  theme,
  canRequestDirections,
  canShowStreetView,
  onSelectPoint,
  onRequestDirections,
  onOpenStreetView,
  onCopyParkingLink,
}: CycleParkingMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const parkingMarkerRefs = useRef(new Map<string, RenderedMarker>());
  const startMarkerRef = useRef<RenderedMarker | null>(null);
  const liveMarkerRef = useRef<RenderedMarker | null>(null);
  const instructionMarkerRef = useRef<RenderedMarker | null>(null);
  const previousFocusRouteRef = useRef(route);
  const mobileSheetStateRef = useRef(mobileSheetState);
  const previousMobileSheetStateRef = useRef(mobileSheetState);
  const frameRef = useRef<number | null>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [viewport, setViewport] = useState<{
    bounds: ParkingMapBounds | null;
    zoom: number;
  }>({
    bounds: null,
    zoom: 13,
  });
  const handleViewportChange = useCallback(
    ({ bounds, zoom }: { bounds: ParkingMapBounds; zoom: number }) => {
      setViewport((current) => {
        if (
          current.zoom === zoom &&
          current.bounds?.north === bounds.north &&
          current.bounds.south === bounds.south &&
          current.bounds.east === bounds.east &&
          current.bounds.west === bounds.west
        ) {
          return current;
        }

        return { bounds, zoom };
      });
    },
    [],
  );
  const updateViewport = useCallback(() => {
    if (!mapRef.current || frameRef.current !== null) {
      return;
    }

    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;

      if (!mapRef.current) {
        return;
      }

      handleViewportChange({
        bounds: getVisibleMapBounds(mapRef.current),
        zoom: mapRef.current.getZoom(),
      });
    });
  }, [handleViewportChange]);
  const selectedInstruction = useMemo(() => {
    if (!route || !routeInstructionFocusRequest) {
      return null;
    }

    return (
      route.instructions.find(
        (instruction) => instruction.id === routeInstructionFocusRequest.id,
      ) ?? null
    );
  }, [route, routeInstructionFocusRequest]);
  const rankedPointRanks = useMemo(() => {
    return new Map(
      rankedPoints
        .slice(0, rankedPointCount)
        .map((point, index) => [point.id, index + 1]),
    );
  }, [rankedPoints]);
  const highlightedPoints = useMemo(
    () => rankedPoints.slice(0, highlightedRankCount),
    [rankedPoints],
  );
  const finalApproachPositions = useMemo(
    () => getFinalApproachPositions(route, selectedPoint),
    [route, selectedPoint],
  );
  const initialApproachPositions = useMemo(
    () => getInitialApproachPositions(route, userLocation),
    [route, userLocation],
  );
  const visiblePoints = useMemo(
    () =>
      isDirectionsMode && selectedPoint
        ? [selectedPoint]
        : getRenderableParkingPoints({
            bounds: viewport.bounds,
            pinnedPoints: rankedPoints,
            points,
            selectedPoint,
            zoom: viewport.zoom,
          }),
    [
      isDirectionsMode,
      points,
      rankedPoints,
      selectedPoint,
      viewport.bounds,
      viewport.zoom,
    ],
  );

  useEffect(() => {
    mobileSheetStateRef.current = mobileSheetState;
  }, [mobileSheetState]);

  useEffect(() => {
    const container = mapContainerRef.current;

    if (!container || mapRef.current) {
      return;
    }

    const abortController = new AbortController();
    let nextMap: MapLibreMap | null = null;
    let isDisposed = false;

    const createMap = (style: StyleSpecification | string) => {
      if (isDisposed) {
        return;
      }

      nextMap = new maplibregl.Map({
        attributionControl: false,
        center: toLngLat(defaultCenter),
        container,
        minZoom: 1,
        style,
        zoom: 13,
      });
      const navigationControl = new maplibregl.NavigationControl({
        showCompass: false,
      });
      const attributionControl = new maplibregl.AttributionControl({
        compact: false,
      });

      nextMap.addControl(navigationControl, 'top-left');
      nextMap.addControl(attributionControl, 'bottom-right');
      nextMap.on('styleimagemissing', (event) => {
        if (!nextMap || nextMap.hasImage(event.id)) {
          return;
        }

        nextMap.addImage(event.id, {
          data: new Uint8Array([0, 0, 0, 0]),
          height: 1,
          width: 1,
        });
      });
      nextMap.on('load', () => {
        if (!nextMap) {
          return;
        }

        setIsMapLoaded(true);
        handleViewportChange({
          bounds: getVisibleMapBounds(nextMap),
          zoom: nextMap.getZoom(),
        });
      });
      nextMap.on('move', updateViewport);
      nextMap.on('zoom', updateViewport);
      nextMap.on('moveend', () => {
        if (!nextMap) {
          return;
        }

        handleViewportChange({
          bounds: getVisibleMapBounds(nextMap),
          zoom: nextMap.getZoom(),
        });
      });
      nextMap.on('zoomend', () => {
        if (!nextMap) {
          return;
        }

        handleViewportChange({
          bounds: getVisibleMapBounds(nextMap),
          zoom: nextMap.getZoom(),
        });
      });

      mapRef.current = nextMap;
      setMap(nextMap);
    };

    void loadMapLibreBasemapStyle(abortController.signal)
      .then(createMap)
      .catch((error: unknown) => {
        if (abortController.signal.aborted) {
          return;
        }

        console.warn('Falling back to unpatched MapLibre style.', error);
        createMap(mapLibreBasemapStyleUrl);
      });

    return () => {
      isDisposed = true;
      abortController.abort();

      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }

      parkingMarkerRefs.current.forEach(cleanupRenderedMarker);
      parkingMarkerRefs.current.clear();
      cleanupRenderedMarker(startMarkerRef.current);
      cleanupRenderedMarker(liveMarkerRef.current);
      cleanupRenderedMarker(instructionMarkerRef.current);
      startMarkerRef.current = null;
      liveMarkerRef.current = null;
      instructionMarkerRef.current = null;
      nextMap?.remove();
      mapRef.current = null;
      setMap(null);
      setIsMapLoaded(false);
    };
  }, [handleViewportChange, updateViewport]);

  useEffect(() => {
    if (!map) {
      return;
    }

    const container = map.getContainer();
    container.classList.toggle('bike-map-dark', theme === 'dark');
    container.classList.toggle('bike-map-light', theme === 'light');
  }, [map, theme]);

  useEffect(() => {
    if (!map) {
      return;
    }

    const mapElement = map.getContainer();
    const controlPane = document.querySelector<HTMLElement>('.control-pane');
    const resizeMap = () => {
      map.resize();
      updateViewport();
    };

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', resizeMap);

      return () => window.removeEventListener('resize', resizeMap);
    }

    const resizeObserver = new ResizeObserver(resizeMap);
    resizeObserver.observe(mapElement);

    if (controlPane) {
      resizeObserver.observe(controlPane);
    }

    window.addEventListener('resize', resizeMap);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', resizeMap);
    };
  }, [map, mobileSheetState, updateViewport]);

  useEffect(() => {
    if (!map || !isMapLoaded) {
      return;
    }

    syncLineLayer({
      data: createLineData(route?.points ?? null),
      id: 'route-line',
      map,
      style:
        route?.source === 'local'
          ? {
              color: '#f97316',
              dashArray: [1.5, 2],
              opacity: 0.9,
              width: 4,
            }
          : {
              color: '#2563eb',
              opacity: 0.82,
              width: 6,
            },
    });
    syncLineLayer({
      data: createLineData(initialApproachPositions),
      id: 'initial-approach-line',
      map,
      style: {
        color: '#f97316',
        dashArray: [1.5, 2],
        opacity: 0.9,
        width: 4,
      },
    });
    syncLineLayer({
      data: createLineData(finalApproachPositions),
      id: 'final-approach-line',
      map,
      style: {
        color: '#f97316',
        dashArray: [1.5, 2],
        opacity: 0.9,
        width: 4,
      },
    });
  }, [
    finalApproachPositions,
    initialApproachPositions,
    isMapLoaded,
    map,
    route,
  ]);

  useEffect(() => {
    if (!map) {
      return;
    }

    cleanupRenderedMarker(startMarkerRef.current);

    const { popup, root } = createRenderedPopup(<StartPopupContent />, {
      offset: [0, -32],
    });
    const element = createPinMarkerElement('start-marker');
    const marker = new maplibregl.Marker({
      anchor: 'bottom',
      element,
    })
      .setLngLat([userLocation.longitude, userLocation.latitude])
      .setPopup(popup)
      .addTo(map);

    startMarkerRef.current = {
      marker,
      popup,
      popupRoot: root,
    };

    return () => {
      cleanupRenderedMarker(startMarkerRef.current);
      startMarkerRef.current = null;
    };
  }, [map, userLocation]);

  useEffect(() => {
    if (!map) {
      return;
    }

    cleanupRenderedMarker(liveMarkerRef.current);
    liveMarkerRef.current = null;

    if (!liveRouteMarker) {
      return;
    }

    const element = createLiveRouteMarkerElement({
      headingDegrees: liveRouteMarker.headingDegrees,
      isOffRoute: liveRouteMarker.isOffRoute,
    });
    element.style.zIndex = '1250';

    const marker = new maplibregl.Marker({
      anchor: 'center',
      element,
    })
      .setLngLat(toLngLat(liveRouteMarker.position))
      .addTo(map);

    liveMarkerRef.current = { marker };

    return () => {
      cleanupRenderedMarker(liveMarkerRef.current);
      liveMarkerRef.current = null;
    };
  }, [liveRouteMarker, map]);

  useEffect(() => {
    if (!map) {
      return;
    }

    cleanupRenderedMarker(instructionMarkerRef.current);
    instructionMarkerRef.current = null;

    if (!selectedInstruction) {
      return;
    }

    const element = createSelectedInstructionMarkerElement(
      getRouteInstructionManeuver(selectedInstruction),
    );
    element.style.zIndex = '900';

    const marker = new maplibregl.Marker({
      anchor: 'center',
      element,
    })
      .setLngLat(toLngLat(selectedInstruction.anchor))
      .addTo(map);

    instructionMarkerRef.current = { marker };

    return () => {
      cleanupRenderedMarker(instructionMarkerRef.current);
      instructionMarkerRef.current = null;
    };
  }, [map, selectedInstruction]);

  useEffect(() => {
    if (!map) {
      return;
    }

    parkingMarkerRefs.current.forEach(cleanupRenderedMarker);
    parkingMarkerRefs.current.clear();
    let centerTimeoutId: number | null = null;

    visiblePoints.forEach((point) => {
      const rank = rankedPointRanks.get(point.id);
      const isSelected = point.id === selectedPoint?.id;
      const element = isSelected
        ? isDirectionsMode
          ? createPinMarkerElement('destination-marker')
          : rank !== undefined
            ? createParkingMarkerElement('selected-ranked', String(rank))
            : createParkingMarkerElement('selected')
        : rank !== undefined
          ? createRankedParkingMarkerElement(rank)
          : createParkingMarkerElement('default');
      const { popup, root } = createRenderedPopup(
        <ParkingPopupContent
          canRequestDirections={canRequestDirections}
          canShowStreetView={canShowStreetView}
          copiedShareButton={copiedShareButton}
          isDirectionsMode={isDirectionsMode}
          onCopyParkingLink={onCopyParkingLink}
          onOpenStreetView={onOpenStreetView}
          onRequestDirections={onRequestDirections}
          point={point}
        />,
        {
          offset: isDirectionsMode && isSelected ? [0, -34] : [0, -18],
        },
      );
      const marker = new maplibregl.Marker({
        anchor: isDirectionsMode && isSelected ? 'bottom' : 'center',
        element,
      })
        .setLngLat([point.longitude, point.latitude])
        .addTo(map);

      if (isSelected) {
        element.style.zIndex = '1000';
      }

      if (!isDirectionsMode) {
        element.addEventListener('click', () => {
          onSelectPoint(point.id);

          if (point.id === selectedPoint?.id) {
            popup.setLngLat([point.longitude, point.latitude]).addTo(map);
          }
        });
      }

      parkingMarkerRefs.current.set(point.id, {
        marker,
        popup,
        popupRoot: root,
      });
    });

    const currentSelectedPoint = selectedPoint;
    const selectedEntry = currentSelectedPoint
      ? parkingMarkerRefs.current.get(currentSelectedPoint.id)
      : null;

    if (currentSelectedPoint && selectedEntry?.popup && !route) {
      const shouldCenterCollapsedPopup =
        mobileSheetStateRef.current === 'collapsed';
      selectedEntry.popup
        .setLngLat([
          currentSelectedPoint.longitude,
          currentSelectedPoint.latitude,
        ])
        .addTo(map);

      if (shouldCenterCollapsedPopup) {
        centerTimeoutId = window.setTimeout(
          () =>
            selectedEntry.popup &&
            centerPopupInVisibleMapArea(map, selectedEntry.popup),
          100,
        );
      }
    }

    return () => {
      if (centerTimeoutId !== null) {
        window.clearTimeout(centerTimeoutId);
      }

      parkingMarkerRefs.current.forEach(cleanupRenderedMarker);
      parkingMarkerRefs.current.clear();
    };
  }, [
    canRequestDirections,
    canShowStreetView,
    copiedShareButton,
    isDirectionsMode,
    map,
    onCopyParkingLink,
    onOpenStreetView,
    onRequestDirections,
    onSelectPoint,
    rankedPointRanks,
    route,
    selectedPoint,
    visiblePoints,
  ]);

  useEffect(() => {
    if (!map) {
      return;
    }

    const previousMobileSheetState = previousMobileSheetStateRef.current;
    previousMobileSheetStateRef.current = mobileSheetState;

    if (
      previousMobileSheetState === mobileSheetState ||
      !selectedPoint ||
      route
    ) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const popup = parkingMarkerRefs.current.get(selectedPoint.id)?.popup;

      if (!popup?.isOpen()) {
        return;
      }

      if (mobileSheetState === 'collapsed') {
        centerPopupInVisibleMapArea(map, popup);
        return;
      }

      const zoom = map.getZoom();
      map.panTo(
        getMapPointFocusCenter(
          map,
          parkingPointToRoutePoint(selectedPoint),
          zoom,
          mobileSheetState,
        ),
        {
          duration: 650,
          easing: (progress) => progress * (2 - progress),
        },
      );
    }, 380);

    return () => window.clearTimeout(timeoutId);
  }, [map, mobileSheetState, route, selectedPoint]);

  useEffect(() => {
    if (!map) {
      return;
    }

    const hadRoute = previousFocusRouteRef.current !== null;
    previousFocusRouteRef.current = route;

    map.stop();

    if (!route && hadRoute) {
      return;
    }

    if (route && selectedPoint) {
      const bounds = createBounds([
        userLocationToPoint(userLocation),
        parkingPointToRoutePoint(selectedPoint),
        ...route.points,
      ]);

      map.fitBounds(bounds, {
        duration: 700,
        maxZoom: 17,
        padding: getFocusPadding(map),
      });
      return;
    }

    const focusPoints =
      highlightedPoints.length > 0
        ? highlightedPoints
        : nearestPoint
          ? [nearestPoint]
          : [];

    if (selectedPoint) {
      if (mobileSheetState === 'collapsed') {
        return;
      }

      if (
        selectedPoint.id === nearestPoint?.id &&
        mobileSheetState === 'expanded'
      ) {
        const bounds = createBounds([
          userLocationToPoint(userLocation),
          ...focusPoints.map(parkingPointToRoutePoint),
        ]);

        map.fitBounds(bounds, {
          duration: 700,
          maxZoom: 17,
          padding: getFocusPadding(map),
        });
        return;
      }

      const zoom = Math.max(map.getZoom(), 16);
      map.flyTo({
        center: getMapPointFocusCenter(
          map,
          parkingPointToRoutePoint(selectedPoint),
          zoom,
          mobileSheetState,
        ),
        duration: 700,
        zoom,
      });
      return;
    }

    if (focusPoints.length > 0) {
      const bounds = createBounds([
        userLocationToPoint(userLocation),
        ...focusPoints.map(parkingPointToRoutePoint),
      ]);

      map.fitBounds(bounds, {
        duration: 700,
        maxZoom: 17,
        padding: getFocusPadding(map),
      });
      return;
    }

    map.jumpTo({
      center: [userLocation.longitude, userLocation.latitude],
      zoom: 16,
    });
  }, [
    currentLocationFocusRequestId,
    highlightedPoints,
    map,
    mobileSheetState,
    nearestPoint,
    route,
    selectedPoint,
    userLocation,
  ]);

  useEffect(() => {
    if (!map || !liveRouteMarker || !shouldFollowLiveRoute) {
      return;
    }

    if (isPointInVisibleMapArea(map, liveRouteMarker.position)) {
      return;
    }

    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;

    map.panTo(
      getMapPointFocusCenter(
        map,
        liveRouteMarker.position,
        map.getZoom(),
        mobileSheetState,
      ),
      {
        duration: prefersReducedMotion ? 0 : 450,
        easing: (progress) => progress * (2 - progress),
      },
    );
  }, [
    liveRouteMarker,
    liveRouteMarker?.updatedAt,
    map,
    mobileSheetState,
    shouldFollowLiveRoute,
  ]);

  useEffect(() => {
    if (!map || !routeInstructionFocusRequest || !route) {
      return;
    }

    const instruction = route.instructions.find(
      (candidate) => candidate.id === routeInstructionFocusRequest.id,
    );

    if (!instruction) {
      return;
    }

    const zoom = Math.max(map.getZoom(), 16);
    map.flyTo({
      center: getMapPointFocusCenter(
        map,
        instruction.anchor,
        zoom,
        mobileSheetState,
      ),
      duration: 650,
      zoom,
    });
  }, [
    map,
    mobileSheetState,
    route,
    routeInstructionFocusRequest,
    routeInstructionFocusRequest?.requestId,
  ]);

  return <div className={`bike-map bike-map-${theme}`} ref={mapContainerRef} />;
}
