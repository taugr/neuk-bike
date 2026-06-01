'use client';

import L from 'leaflet';
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet';
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
  onSelectPoint: (id: string) => void;
  onRequestDirections: (point: ParkingPoint) => void;
  onCopyParkingLink: (point: ParkingPoint) => void;
};

const defaultCenter: [number, number] = [55.9533, -3.1883];
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

type PopupWithMap = L.Popup & {
  _map?: L.Map;
};

type VisibleMapArea = {
  bottom: number;
  center: L.Point;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
};

function getVisibleMapArea(map: L.Map): VisibleMapArea {
  const mapElement = map.getContainer();
  const size = map.getSize();
  const fallbackArea = {
    bottom: size.y,
    center: L.point(size.x / 2, size.y / 2),
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
    center: L.point(left + width / 2, top + height / 2),
    height,
    left,
    right,
    top,
    width,
  };
}

function centerPopupInVisibleMapArea(popup: L.Popup) {
  if (!popup.isOpen()) {
    return;
  }

  const map = (popup as PopupWithMap)._map;
  const popupElement = popup.getElement();

  if (!map || !popupElement) {
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
    animate: true,
    duration: 0.65,
    easeLinearity: 0.25,
  });
}

function getFocusPadding(map: L.Map): L.FitBoundsOptions {
  const visibleArea = getVisibleMapArea(map);
  const size = map.getSize();
  const coveredLeft = visibleArea.left;
  const coveredRight = size.x - visibleArea.right;
  const coveredTop = visibleArea.top;
  const coveredBottom = size.y - visibleArea.bottom;

  return {
    paddingBottomRight: [40 + coveredRight, 40 + coveredBottom],
    paddingTopLeft: [40 + coveredLeft, 40 + coveredTop],
  };
}

function getMapPointFocusCenter(
  map: L.Map,
  latLng: L.LatLngExpression,
  zoom: number,
  mobileSheetState: 'collapsed' | 'expanded',
) {
  const point = L.latLng(latLng);
  const size = map.getSize();
  const visibleArea = getVisibleMapArea(map);

  if (
    visibleArea.left === 0 &&
    visibleArea.top === 0 &&
    visibleArea.right === size.x &&
    visibleArea.bottom === size.y
  ) {
    return point;
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
  const targetPoint = L.point(visibleArea.center.x, targetY);
  const mapCenterPoint = L.point(size.x / 2, size.y / 2);
  const projectedPoint = map.project(point, zoom);
  const projectedCenter = projectedPoint.subtract(
    targetPoint.subtract(mapCenterPoint),
  );

  return map.unproject(projectedCenter, zoom);
}

function isPointInVisibleMapArea(map: L.Map, latLng: L.LatLngExpression) {
  const visibleArea = getVisibleMapArea(map);
  const projectedPoint = map.latLngToContainerPoint(latLng);
  const insetX = Math.min(32, visibleArea.width * 0.18);
  const insetY = Math.min(32, visibleArea.height * 0.18);

  return (
    projectedPoint.x >= visibleArea.left + insetX &&
    projectedPoint.x <= visibleArea.right - insetX &&
    projectedPoint.y >= visibleArea.top + insetY &&
    projectedPoint.y <= visibleArea.bottom - insetY
  );
}

function createParkingIcon(
  kind: 'default' | 'selected' | 'selected-ranked',
  label = '',
) {
  return L.divIcon({
    className: `parking-marker parking-marker-${kind}`,
    html: `<span>${label}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  });
}

function createRankedParkingIcon(rank: number) {
  return L.divIcon({
    className: `parking-marker parking-marker-ranked parking-marker-rank-${rank}`,
    html: `<span>${rank}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  });
}

function ParkingPopupIcon({ icon }: { icon: ParkingPopupIcon }) {
  const Icon = popupIconByName[icon] ?? MapPin;

  return <Icon size={15} strokeWidth={2.25} aria-hidden="true" />;
}

const startIcon = L.divIcon({
  className: 'start-marker',
  html: '<span></span>',
  iconSize: [32, 42],
  iconAnchor: [16, 42],
  popupAnchor: [0, -42],
});

const destinationIcon = L.divIcon({
  className: 'destination-marker',
  html: '<span></span>',
  iconSize: [32, 42],
  iconAnchor: [16, 42],
  popupAnchor: [0, -42],
});

function createLiveRouteIcon({
  headingDegrees,
  isOffRoute,
}: {
  headingDegrees: number | null;
  isOffRoute: boolean;
}) {
  const headingCue =
    headingDegrees === null
      ? ''
      : `<i class="live-route-heading" style="transform: translateX(-50%) rotate(${headingDegrees}deg)" aria-hidden="true"></i>`;

  return L.divIcon({
    className: isOffRoute
      ? 'live-route-marker live-route-marker-off-route'
      : 'live-route-marker',
    html: `<span>${headingCue}<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><circle cx="18.5" cy="17.5" r="3.5"></circle><circle cx="5.5" cy="17.5" r="3.5"></circle><circle cx="15" cy="5" r="1"></circle><path d="m12 17.5 3-6 2 3h2"></path><path d="m5.5 17.5 3-6h4l3 6"></path><path d="m8.5 11.5 2-4h3.5"></path></svg></span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
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

function createSelectedInstructionIcon(maneuver: RouteInstructionManeuver) {
  return L.divIcon({
    className: `selected-route-instruction-marker selected-route-instruction-marker-${maneuver}`,
    html: `<span><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.4">${getSelectedInstructionMarkerSvg(maneuver)}</svg></span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

function getFinalApproachPositions(
  route: CycleRoute | null,
  selectedPoint: ParkingPoint | null,
): [number, number][] | null {
  const routeEnd = route?.points.at(-1);

  if (!routeEnd || !selectedPoint) {
    return null;
  }

  const destination: [number, number] = [
    selectedPoint.latitude,
    selectedPoint.longitude,
  ];
  const distanceMeters = L.latLng(routeEnd).distanceTo(destination);

  if (distanceMeters < 2) {
    return null;
  }

  return [routeEnd, destination];
}

function getInitialApproachPositions(
  route: CycleRoute | null,
  userLocation: UserLocation,
): [number, number][] | null {
  const routeStart = route?.points.at(0);

  if (!routeStart) {
    return null;
  }

  const start: [number, number] = [
    userLocation.latitude,
    userLocation.longitude,
  ];
  const distanceMeters = L.latLng(start).distanceTo(routeStart);

  if (distanceMeters < 2) {
    return null;
  }

  return [start, routeStart];
}

function MapFocus({
  currentLocationFocusRequestId,
  highlightedPoints,
  mobileSheetState,
  nearestPoint,
  route,
  selectedPoint,
  userLocation,
}: {
  currentLocationFocusRequestId: number;
  highlightedPoints: ParkingPoint[];
  mobileSheetState: 'collapsed' | 'expanded';
  nearestPoint: ParkingPoint | null;
  route: CycleRoute | null;
  selectedPoint: ParkingPoint | null;
  userLocation: UserLocation;
}) {
  const map = useMap();
  const previousRouteRef = useRef(route);

  useEffect(() => {
    const hadRoute = previousRouteRef.current !== null;
    previousRouteRef.current = route;

    map.stop();

    if (!route && hadRoute) {
      return;
    }

    if (route && selectedPoint) {
      const bounds = L.latLngBounds([
        [userLocation.latitude, userLocation.longitude],
        [selectedPoint.latitude, selectedPoint.longitude],
        ...route.points,
      ]);

      map.fitBounds(bounds, {
        animate: true,
        duration: 0.7,
        maxZoom: 17,
        ...getFocusPadding(map),
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
        const bounds = L.latLngBounds([
          [userLocation.latitude, userLocation.longitude],
          ...focusPoints.map(
            (point) => [point.latitude, point.longitude] as [number, number],
          ),
        ]);

        map.fitBounds(bounds, {
          animate: true,
          duration: 0.7,
          maxZoom: 17,
          ...getFocusPadding(map),
        });
        return;
      }

      const zoom = Math.max(map.getZoom(), 16);
      map.flyTo(
        getMapPointFocusCenter(
          map,
          [selectedPoint.latitude, selectedPoint.longitude],
          zoom,
          mobileSheetState,
        ),
        zoom,
        {
          duration: 0.7,
        },
      );
      return;
    }

    if (focusPoints.length > 0) {
      const bounds = L.latLngBounds([
        [userLocation.latitude, userLocation.longitude],
        ...focusPoints.map(
          (point) => [point.latitude, point.longitude] as [number, number],
        ),
      ]);

      map.fitBounds(bounds, {
        animate: true,
        duration: 0.7,
        maxZoom: 17,
        ...getFocusPadding(map),
      });
      return;
    }

    map.setView([userLocation.latitude, userLocation.longitude], 16);
  }, [
    currentLocationFocusRequestId,
    highlightedPoints,
    map,
    nearestPoint,
    route,
    selectedPoint,
    userLocation,
  ]);

  return null;
}

function LiveRouteFollower({
  marker,
  mobileSheetState,
  shouldFollow,
}: {
  marker: {
    position: CycleRoutePoint;
    updatedAt: number;
  } | null;
  mobileSheetState: 'collapsed' | 'expanded';
  shouldFollow: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    if (!marker || !shouldFollow) {
      return;
    }

    const nextCenter = L.latLng(marker.position);

    if (isPointInVisibleMapArea(map, nextCenter)) {
      return;
    }

    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;

    map.panTo(
      getMapPointFocusCenter(map, nextCenter, map.getZoom(), mobileSheetState),
      {
        animate: !prefersReducedMotion,
        duration: 0.45,
        easeLinearity: 0.25,
      },
    );
  }, [map, marker, marker?.updatedAt, mobileSheetState, shouldFollow]);

  return null;
}

function RouteInstructionFocus({
  focusRequest,
  mobileSheetState,
  route,
}: {
  focusRequest: {
    id: string;
    requestId: number;
  } | null;
  mobileSheetState: 'collapsed' | 'expanded';
  route: CycleRoute | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (!focusRequest || !route) {
      return;
    }

    const instruction = route.instructions.find(
      (candidate) => candidate.id === focusRequest.id,
    );

    if (!instruction) {
      return;
    }

    const zoom = Math.max(map.getZoom(), 16);
    map.flyTo(
      getMapPointFocusCenter(map, instruction.anchor, zoom, mobileSheetState),
      zoom,
      {
        duration: 0.65,
      },
    );
  }, [focusRequest, focusRequest?.requestId, map, mobileSheetState, route]);

  return null;
}

function AttributionPrefix() {
  const map = useMap();

  useEffect(() => {
    map.attributionControl.setPrefix(false);
  }, [map]);

  return null;
}

function MapThemeClass({ theme }: { theme: 'light' | 'dark' }) {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    container.classList.toggle('bike-map-dark', theme === 'dark');
    container.classList.toggle('bike-map-light', theme === 'light');
  }, [map, theme]);

  return null;
}

function getVisibleMapBounds(map: L.Map): ParkingMapBounds {
  const visibleArea = getVisibleMapArea(map);
  const northWest = map.containerPointToLatLng([
    visibleArea.left,
    visibleArea.top,
  ]);
  const southEast = map.containerPointToLatLng([
    visibleArea.right,
    visibleArea.bottom,
  ]);

  return {
    east: southEast.lng,
    north: northWest.lat,
    south: southEast.lat,
    west: northWest.lng,
  };
}

function MapViewportTracker({
  mobileSheetState,
  onViewportChange,
}: {
  mobileSheetState: 'collapsed' | 'expanded';
  onViewportChange: (viewport: {
    bounds: ParkingMapBounds;
    zoom: number;
  }) => void;
}) {
  const map = useMap();
  const frameRef = useRef<number | null>(null);
  const updateViewport = useCallback(() => {
    if (frameRef.current !== null) {
      return;
    }

    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      onViewportChange({
        bounds: getVisibleMapBounds(map),
        zoom: map.getZoom(),
      });
    });
  }, [map, onViewportChange]);

  useMapEvents({
    move: () => {
      updateViewport();
    },
    moveend: () => {
      onViewportChange({
        bounds: getVisibleMapBounds(map),
        zoom: map.getZoom(),
      });
    },
    zoom: () => {
      updateViewport();
    },
    zoomend: () => {
      onViewportChange({
        bounds: getVisibleMapBounds(map),
        zoom: map.getZoom(),
      });
    },
  });

  useEffect(() => {
    onViewportChange({
      bounds: getVisibleMapBounds(map),
      zoom: map.getZoom(),
    });
  }, [map, mobileSheetState, onViewportChange]);

  useEffect(() => {
    const mapElement = map.getContainer();
    const controlPane = document.querySelector<HTMLElement>('.control-pane');

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateViewport);

      return () => window.removeEventListener('resize', updateViewport);
    }

    const resizeObserver = new ResizeObserver(() => updateViewport());
    resizeObserver.observe(mapElement);

    if (controlPane) {
      resizeObserver.observe(controlPane);
    }

    window.addEventListener('resize', updateViewport);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateViewport);
    };
  }, [map, updateViewport]);

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  return null;
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
  onSelectPoint,
  onRequestDirections,
  onCopyParkingLink,
}: CycleParkingMapProps) {
  const markerRefs = useRef(new Map<string, L.Marker>());
  const hadRouteRef = useRef(false);
  const mobileSheetStateRef = useRef(mobileSheetState);
  const previousMobileSheetStateRef = useRef(mobileSheetState);
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
  const icons = useMemo(
    () => ({
      default: createParkingIcon('default'),
      selected: createParkingIcon('selected'),
    }),
    [],
  );
  const liveRouteIcon = useMemo(
    () =>
      createLiveRouteIcon({
        headingDegrees: liveRouteMarker?.headingDegrees ?? null,
        isOffRoute: liveRouteMarker?.isOffRoute ?? false,
      }),
    [liveRouteMarker?.headingDegrees, liveRouteMarker?.isOffRoute],
  );
  const rankedIcons = useMemo(() => {
    return new Map(
      Array.from({ length: rankedPointCount }, (_, index) => {
        const rank = index + 1;
        return [rank, createRankedParkingIcon(rank)];
      }),
    );
  }, []);
  const selectedRankedIcons = useMemo(() => {
    return new Map(
      Array.from({ length: rankedPointCount }, (_, index) => {
        const rank = index + 1;
        return [rank, createParkingIcon('selected-ranked', String(rank))];
      }),
    );
  }, []);
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
  const selectedInstructionIcon = useMemo(() => {
    if (!selectedInstruction) {
      return null;
    }

    return createSelectedInstructionIcon(
      getRouteInstructionManeuver(selectedInstruction),
    );
  }, [selectedInstruction]);
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
      const popup = markerRefs.current.get(selectedPoint.id)?.getPopup();

      if (!popup?.isOpen()) {
        return;
      }

      if (mobileSheetState === 'collapsed') {
        centerPopupInVisibleMapArea(popup);
        return;
      }

      const map = (popup as PopupWithMap)._map;

      if (map) {
        map.panTo(
          getMapPointFocusCenter(
            map,
            [selectedPoint.latitude, selectedPoint.longitude],
            map.getZoom(),
            mobileSheetState,
          ),
          {
            animate: true,
            duration: 0.65,
            easeLinearity: 0.25,
          },
        );
      }
    }, 380);

    return () => window.clearTimeout(timeoutId);
  }, [mobileSheetState, route, selectedPoint]);

  useEffect(() => {
    const hadRoute = hadRouteRef.current;
    hadRouteRef.current = route !== null;

    if (route) {
      markerRefs.current.forEach((marker) => marker.closePopup());
      return;
    }

    if (!selectedPoint || hadRoute) {
      return;
    }

    let centerTimeoutId: number | null = null;
    const openTimeoutId = window.setTimeout(() => {
      const marker = markerRefs.current.get(selectedPoint.id);
      const popup = marker?.getPopup();
      const shouldCenterCollapsedPopup =
        mobileSheetStateRef.current === 'collapsed';

      if (popup) {
        popup.options.autoPan = !shouldCenterCollapsedPopup;
      }

      marker?.openPopup();

      if (popup) {
        popup.options.autoPan = false;

        if (shouldCenterCollapsedPopup) {
          centerTimeoutId = window.setTimeout(
            () => centerPopupInVisibleMapArea(popup),
            100,
          );
        }
      }
    }, 250);

    return () => {
      window.clearTimeout(openTimeoutId);

      if (centerTimeoutId !== null) {
        window.clearTimeout(centerTimeoutId);
      }
    };
  }, [route, selectedPoint]);

  return (
    <MapContainer
      center={defaultCenter}
      zoom={13}
      scrollWheelZoom
      className={`bike-map bike-map-${theme}`}
    >
      <AttributionPrefix />
      <MapThemeClass theme={theme} />
      <MapViewportTracker
        mobileSheetState={mobileSheetState}
        onViewportChange={handleViewportChange}
      />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapFocus
        currentLocationFocusRequestId={currentLocationFocusRequestId}
        highlightedPoints={highlightedPoints}
        mobileSheetState={mobileSheetState}
        nearestPoint={nearestPoint}
        route={route}
        selectedPoint={selectedPoint}
        userLocation={userLocation}
      />
      <LiveRouteFollower
        marker={liveRouteMarker}
        mobileSheetState={mobileSheetState}
        shouldFollow={shouldFollowLiveRoute}
      />
      <RouteInstructionFocus
        focusRequest={routeInstructionFocusRequest}
        mobileSheetState={mobileSheetState}
        route={route}
      />
      {route ? (
        <Polyline
          pathOptions={
            route.source === 'local'
              ? {
                  color: '#f97316',
                  dashArray: '6 8',
                  lineCap: 'round',
                  opacity: 0.9,
                  weight: 4,
                }
              : {
                  color: '#2563eb',
                  opacity: 0.82,
                  weight: 6,
                }
          }
          positions={route.points}
        />
      ) : null}
      {initialApproachPositions ? (
        <Polyline
          pathOptions={{
            color: '#f97316',
            dashArray: '6 8',
            lineCap: 'round',
            opacity: 0.9,
            weight: 4,
          }}
          positions={initialApproachPositions}
        />
      ) : null}
      {finalApproachPositions ? (
        <Polyline
          pathOptions={{
            color: '#f97316',
            dashArray: '6 8',
            lineCap: 'round',
            opacity: 0.9,
            weight: 4,
          }}
          positions={finalApproachPositions}
        />
      ) : null}
      <Marker
        position={[userLocation.latitude, userLocation.longitude]}
        icon={startIcon}
      >
        <Popup keepInView={false}>
          <div className="parking-popup">
            <strong>Start position</strong>
            <span>Current location</span>
          </div>
        </Popup>
      </Marker>
      {liveRouteMarker ? (
        <Marker
          position={liveRouteMarker.position}
          icon={liveRouteIcon}
          zIndexOffset={1250}
        />
      ) : null}
      {selectedInstruction && selectedInstructionIcon ? (
        <Marker
          position={selectedInstruction.anchor}
          icon={selectedInstructionIcon}
          zIndexOffset={900}
        />
      ) : null}
      {visiblePoints.map((point) => {
        const rank = rankedPointRanks.get(point.id);
        const popupDetails = getParkingPopupDetails(point);
        const isSelected = point.id === selectedPoint?.id;
        const icon = isSelected
          ? isDirectionsMode
            ? destinationIcon
            : rank !== undefined
              ? (selectedRankedIcons.get(rank) ?? icons.selected)
              : icons.selected
          : rank !== undefined
            ? (rankedIcons.get(rank) ?? icons.default)
            : icons.default;

        return (
          <Marker
            key={point.id}
            ref={(marker) => {
              if (marker) {
                markerRefs.current.set(point.id, marker);
              } else {
                markerRefs.current.delete(point.id);
              }
            }}
            position={[point.latitude, point.longitude]}
            icon={icon}
            zIndexOffset={isSelected ? 1000 : 0}
            eventHandlers={
              isDirectionsMode
                ? undefined
                : {
                    click: () => onSelectPoint(point.id),
                  }
            }
          >
            <Popup keepInView={false}>
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
                        {detail.emphasis ?? (
                          <ParkingPopupIcon icon={detail.icon} />
                        )}
                      </span>
                      <span className="parking-popup-detail-value">
                        {detail.value}
                      </span>
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
                        <span
                          className="parking-popup-share-feedback"
                          role="status"
                        >
                          Copied
                        </span>
                      ) : null}
                    </button>
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
