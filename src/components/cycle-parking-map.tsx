"use client";

import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import { useEffect, useMemo, useRef } from "react";
import type { ParkingPoint, UserLocation } from "@/lib/types";
import { getParkingDetails } from "@/lib/parking";

type CycleParkingMapProps = {
  points: ParkingPoint[];
  userLocation: UserLocation;
  selectedPoint: ParkingPoint | null;
  nearestPoint: ParkingPoint | null;
  rankedPoints: ParkingPoint[];
  onSelectPoint: (id: string) => void;
};

const defaultCenter: [number, number] = [55.9533, -3.1883];
const highlightedRankCount = 3;
const rankedPointCount = 8;

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
  const targetPoint = L.point(size.x / 2, Math.max(48, visibleHeight / 2));
  const mapCenterPoint = L.point(size.x / 2, size.y / 2);
  const projectedPoint = map.project(latLng, zoom);
  const projectedCenter = projectedPoint.subtract(targetPoint.subtract(mapCenterPoint));

  return map.unproject(projectedCenter, zoom);
}

function createParkingIcon(kind: "default" | "selected", label = "") {
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

const userIcon = L.divIcon({
  className: "user-marker",
  html: "<span></span>",
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

function MapFocus({
  highlightedPoints,
  nearestPoint,
  selectedPoint,
  userLocation,
}: {
  highlightedPoints: ParkingPoint[];
  nearestPoint: ParkingPoint | null;
  selectedPoint: ParkingPoint | null;
  userLocation: UserLocation;
}) {
  const map = useMap();

  useEffect(() => {
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
  }, [highlightedPoints, map, nearestPoint, selectedPoint, userLocation]);

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
  onSelectPoint,
}: CycleParkingMapProps) {
  const markerRefs = useRef(new Map<string, L.Marker>());
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
  const rankedPointRanks = useMemo(() => {
    return new Map(
      rankedPoints.slice(0, rankedPointCount).map((point, index) => [point.id, index + 1]),
    );
  }, [rankedPoints]);
  const highlightedPoints = useMemo(
    () => rankedPoints.slice(0, highlightedRankCount),
    [rankedPoints],
  );

  useEffect(() => {
    if (!selectedPoint) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      markerRefs.current.get(selectedPoint.id)?.openPopup();
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [selectedPoint]);

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
        selectedPoint={selectedPoint}
        userLocation={userLocation}
      />
      <Marker position={[userLocation.latitude, userLocation.longitude]} icon={userIcon}>
        <Popup>
          <div className="parking-popup">
            <strong>Reference location</strong>
            <span>Distances are sorted from here.</span>
          </div>
        </Popup>
      </Marker>
      {points.map((point) => {
        const rank = rankedPointRanks.get(point.id);
        const icon =
          rank !== undefined
            ? (rankedIcons.get(rank) ?? icons.default)
            : point.id === selectedPoint?.id
              ? icons.selected
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
                <strong>{point.name}</strong>
                <dl>
                  {getParkingDetails(point).map((detail) => (
                    <div key={detail.label}>
                      <dt>{detail.label}</dt>
                      <dd>{detail.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
