"use client";

import L from "leaflet";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
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
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import type { ParkingPoint, UserLocation } from "@/lib/types";
import { getParkingPopupDetails } from "@/lib/parking";
import type { ParkingPopupIcon } from "@/lib/parking";
import type { CycleRoute } from "@/lib/cyclestreets";

type CycleParkingMapProps = {
  points: ParkingPoint[];
  userLocation: UserLocation;
  selectedPoint: ParkingPoint | null;
  nearestPoint: ParkingPoint | null;
  rankedPoints: ParkingPoint[];
  route: CycleRoute | null;
  copiedParkingId: string | null;
  onSelectPoint: (id: string) => void;
  onRequestDirections: (point: ParkingPoint) => void;
  onCopyParkingLink: (point: ParkingPoint) => void;
};

const defaultCenter: [number, number] = [55.9533, -3.1883];
const highlightedRankCount = 3;
const rankedPointCount = 8;
const popupIconByName: Record<ParkingPopupIcon, LucideIcon> = {
  "access-open": LockOpen,
  building: Building2,
  covered: Umbrella,
  customer: ShoppingBag,
  distance: Route,
  fixture: Boxes,
  "not-covered": UmbrellaOff,
  parking: ParkingCircle,
  restricted: Lock,
  stand: Bike,
  storage: Warehouse,
  university: GraduationCap,
  unknown: CircleHelp,
};

function getFocusPadding(map: L.Map): L.FitBoundsOptions {
  const size = map.getSize();

  if (size.x <= 820) {
    return {
      paddingTopLeft: [40, 40],
      paddingBottomRight: [40, Math.min(Math.round(size.y * 0.58), size.y - 80)],
    };
  }

  return {
    padding: [40, 40],
  };
}

function getSelectedPointCenter(map: L.Map, selectedPoint: ParkingPoint, zoom: number) {
  const latLng = L.latLng(selectedPoint.latitude, selectedPoint.longitude);
  const size = map.getSize();

  if (size.x > 820) {
    return latLng;
  }

  const coveredHeight = Math.min(Math.round(size.y * 0.58), size.y - 80);
  const visibleHeight = size.y - coveredHeight;
  const targetY = Math.min(
    Math.max(48, visibleHeight - 56),
    Math.max(180, Math.round(visibleHeight * 0.75)),
  );
  const targetPoint = L.point(size.x / 2, targetY);
  const mapCenterPoint = L.point(size.x / 2, size.y / 2);
  const projectedPoint = map.project(latLng, zoom);
  const projectedCenter = projectedPoint.subtract(targetPoint.subtract(mapCenterPoint));

  return map.unproject(projectedCenter, zoom);
}

function createParkingIcon(kind: "default" | "selected" | "selected-ranked", label = "") {
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
  className: "start-marker",
  html: "<span></span>",
  iconSize: [32, 42],
  iconAnchor: [16, 42],
  popupAnchor: [0, -42],
});

const destinationIcon = L.divIcon({
  className: "destination-marker",
  html: "<span></span>",
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

  const destination: [number, number] = [selectedPoint.latitude, selectedPoint.longitude];
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

  const start: [number, number] = [userLocation.latitude, userLocation.longitude];
  const distanceMeters = L.latLng(start).distanceTo(routeStart);

  if (distanceMeters < 2) {
    return null;
  }

  return [start, routeStart];
}

function MapFocus({
  highlightedPoints,
  nearestPoint,
  route,
  selectedPoint,
  userLocation,
}: {
  highlightedPoints: ParkingPoint[];
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
      highlightedPoints.length > 0 ? highlightedPoints : nearestPoint ? [nearestPoint] : [];

    if (selectedPoint) {
      if (selectedPoint.id === nearestPoint?.id) {
        const bounds = L.latLngBounds([
          [userLocation.latitude, userLocation.longitude],
          ...focusPoints.map((point) => [point.latitude, point.longitude] as [number, number]),
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
      map.flyTo(getSelectedPointCenter(map, selectedPoint, zoom), zoom, {
        duration: 0.7,
      });
      return;
    }

    if (focusPoints.length > 0) {
      const bounds = L.latLngBounds([
        [userLocation.latitude, userLocation.longitude],
        ...focusPoints.map((point) => [point.latitude, point.longitude] as [number, number]),
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
  }, [highlightedPoints, map, nearestPoint, route, selectedPoint, userLocation]);

  return null;
}

function AttributionPrefix() {
  const map = useMap();

  useEffect(() => {
    map.attributionControl.setPrefix(false);
  }, [map]);

  return null;
}

export default function CycleParkingMap({
  points,
  userLocation,
  selectedPoint,
  nearestPoint,
  rankedPoints,
  route,
  copiedParkingId,
  onSelectPoint,
  onRequestDirections,
  onCopyParkingLink,
}: CycleParkingMapProps) {
  const markerRefs = useRef(new Map<string, L.Marker>());
  const hadRouteRef = useRef(false);
  const icons = useMemo(
    () => ({
      default: createParkingIcon("default"),
      selected: createParkingIcon("selected"),
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
        return [rank, createParkingIcon("selected-ranked", String(rank))];
      }),
    );
  }, []);
  const rankedPointRanks = useMemo(() => {
    return new Map(
      rankedPoints.slice(0, rankedPointCount).map((point, index) => [point.id, index + 1]),
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
    () => (route && selectedPoint ? [selectedPoint] : points),
    [points, route, selectedPoint],
  );

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

    const timeoutId = window.setTimeout(() => {
      markerRefs.current.get(selectedPoint.id)?.openPopup();
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [route, selectedPoint]);

  return (
    <MapContainer center={defaultCenter} zoom={13} scrollWheelZoom className="bike-map">
      <AttributionPrefix />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapFocus
        highlightedPoints={highlightedPoints}
        nearestPoint={nearestPoint}
        route={route}
        selectedPoint={selectedPoint}
        userLocation={userLocation}
      />
      {route ? (
        <Polyline
          pathOptions={{
            color: "#2563eb",
            opacity: 0.82,
            weight: 6,
          }}
          positions={route.points}
        />
      ) : null}
      {initialApproachPositions ? (
        <Polyline
          pathOptions={{
            color: "#f97316",
            dashArray: "6 8",
            lineCap: "round",
            opacity: 0.9,
            weight: 4,
          }}
          positions={initialApproachPositions}
        />
      ) : null}
      {finalApproachPositions ? (
        <Polyline
          pathOptions={{
            color: "#f97316",
            dashArray: "6 8",
            lineCap: "round",
            opacity: 0.9,
            weight: 4,
          }}
          positions={finalApproachPositions}
        />
      ) : null}
      <Marker position={[userLocation.latitude, userLocation.longitude]} icon={startIcon}>
        <Popup>
          <div className="parking-popup">
            <strong>Start position</strong>
            <span>Distances and directions start here.</span>
          </div>
        </Popup>
      </Marker>
      {visiblePoints.map((point) => {
        const rank = rankedPointRanks.get(point.id);
        const popupDetails = getParkingPopupDetails(point);
        const icon =
          point.id === selectedPoint?.id
            ? route
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
            eventHandlers={{
              click: () => onSelectPoint(point.id),
            }}
          >
            <Popup>
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
                <div className="parking-popup-details" aria-label="Parking details">
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
                    {copiedParkingId === point.id ? (
                      <span className="parking-popup-share-feedback" role="status">
                        Copied
                      </span>
                    ) : null}
                  </button>
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
