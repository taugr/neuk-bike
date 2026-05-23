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
import type { CycleRoute } from '@/lib/cyclestreets';
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
  activeInstructionId: string | null;
  isDirectionsMode: boolean;
  mobileSheetState: 'collapsed' | 'expanded';
  copiedShareButton: { parkingId: string; source: 'list' | 'popup' } | null;
  theme: 'light' | 'dark';
  onSelectPoint: (id: string) => void;
  onSelectInstruction: (id: string) => void;
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

function getControlPaneOverlapHeight(map: L.Map) {
  const size = map.getSize();
  const mapElement = map.getContainer();
  const controlPane = document.querySelector<HTMLElement>('.control-pane');

  if (!controlPane) {
    return 0;
  }

  const mapRect = mapElement.getBoundingClientRect();
  const controlPaneRect = controlPane.getBoundingClientRect();
  const horizontalOverlap =
    Math.min(mapRect.right, controlPaneRect.right) -
    Math.max(mapRect.left, controlPaneRect.left);

  if (horizontalOverlap <= 0) {
    return 0;
  }

  const overlapHeight =
    mapRect.bottom - Math.max(mapRect.top, controlPaneRect.top);

  return Math.min(Math.max(0, Math.round(overlapHeight)), size.y - 80);
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
  const controlPane = document.querySelector<HTMLElement>('.control-pane');
  const controlPaneRect = controlPane?.getBoundingClientRect();
  const horizontalOverlap = controlPaneRect
    ? Math.min(mapRect.right, controlPaneRect.right) -
      Math.max(mapRect.left, controlPaneRect.left)
    : 0;
  const visibleBottom =
    controlPaneRect && horizontalOverlap > 0
      ? Math.min(mapRect.bottom, Math.max(mapRect.top, controlPaneRect.top))
      : mapRect.bottom;
  const visibleCenterX = mapRect.left + mapRect.width / 2;
  const visibleCenterY = mapRect.top + (visibleBottom - mapRect.top) / 2;
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
  const coveredHeight = getControlPaneOverlapHeight(map);

  if (coveredHeight > 0) {
    return {
      paddingTopLeft: [40, 40],
      paddingBottomRight: [40, coveredHeight],
    };
  }

  return {
    padding: [40, 40],
  };
}

function getSelectedPointCenter(
  map: L.Map,
  selectedPoint: ParkingPoint,
  zoom: number,
  mobileSheetState: 'collapsed' | 'expanded',
) {
  const latLng = L.latLng(selectedPoint.latitude, selectedPoint.longitude);
  const size = map.getSize();
  const coveredHeight = getControlPaneOverlapHeight(map);

  if (coveredHeight <= 0) {
    return latLng;
  }

  const visibleHeight = size.y - coveredHeight;
  const targetY =
    mobileSheetState === 'collapsed'
      ? Math.round(visibleHeight * 0.62)
      : Math.min(
          Math.max(48, visibleHeight - 56),
          Math.max(180, Math.round(visibleHeight * 0.75)),
        );
  const targetPoint = L.point(size.x / 2, targetY);
  const mapCenterPoint = L.point(size.x / 2, size.y / 2);
  const projectedPoint = map.project(latLng, zoom);
  const projectedCenter = projectedPoint.subtract(
    targetPoint.subtract(mapCenterPoint),
  );

  return map.unproject(projectedCenter, zoom);
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

function createRouteInstructionIcon(index: number, isActive: boolean) {
  return L.divIcon({
    className: isActive
      ? 'route-instruction-marker route-instruction-marker-active'
      : 'route-instruction-marker',
    html: `<span>${index + 1}</span>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
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
        getSelectedPointCenter(map, selectedPoint, zoom, mobileSheetState),
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

function getMapBounds(map: L.Map): ParkingMapBounds {
  const bounds = map.getBounds();

  return {
    east: bounds.getEast(),
    north: bounds.getNorth(),
    south: bounds.getSouth(),
    west: bounds.getWest(),
  };
}

function MapViewportTracker({
  onViewportChange,
}: {
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
        bounds: getMapBounds(map),
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
        bounds: getMapBounds(map),
        zoom: map.getZoom(),
      });
    },
    zoom: () => {
      updateViewport();
    },
    zoomend: () => {
      onViewportChange({
        bounds: getMapBounds(map),
        zoom: map.getZoom(),
      });
    },
  });

  useEffect(() => {
    onViewportChange({
      bounds: getMapBounds(map),
      zoom: map.getZoom(),
    });
  }, [map, onViewportChange]);

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
  activeInstructionId,
  isDirectionsMode,
  mobileSheetState,
  copiedShareButton,
  theme,
  onSelectPoint,
  onSelectInstruction,
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
          getSelectedPointCenter(
            map,
            selectedPoint,
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
      <MapViewportTracker onViewportChange={handleViewportChange} />
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
      {route?.instructions.map((instruction, index) => (
        <Marker
          key={instruction.id}
          position={instruction.anchor}
          icon={createRouteInstructionIcon(
            index,
            instruction.id === activeInstructionId,
          )}
          title={`Show step ${index + 1}`}
          zIndexOffset={instruction.id === activeInstructionId ? 900 : 650}
          eventHandlers={{
            click: () => onSelectInstruction(instruction.id),
          }}
        />
      ))}
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
