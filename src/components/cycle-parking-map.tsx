"use client";

import L from "leaflet";
import { AttributionControl, MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import { useEffect, useMemo } from "react";
import type { ParkingPoint, UserLocation } from "@/lib/types";
import { formatDistance } from "@/lib/geo";

type CycleParkingMapProps = {
  points: ParkingPoint[];
  userLocation: UserLocation;
  selectedPoint: ParkingPoint | null;
  nearestPoint: ParkingPoint | null;
  onSelectPoint: (id: string) => void;
};

const defaultCenter: [number, number] = [55.9533, -3.1883];

function createParkingIcon(kind: "default" | "nearest" | "selected") {
  const className = `parking-marker parking-marker-${kind}`;
  const label = kind === "nearest" ? "1" : "";

  return L.divIcon({
    className,
    html: `<span>${label}</span>`,
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
  nearestPoint,
  selectedPoint,
  userLocation,
}: {
  nearestPoint: ParkingPoint | null;
  selectedPoint: ParkingPoint | null;
  userLocation: UserLocation;
}) {
  const map = useMap();

  useEffect(() => {
    if (selectedPoint) {
      if (selectedPoint.id === nearestPoint?.id) {
        const bounds = L.latLngBounds([
          [userLocation.latitude, userLocation.longitude],
          [selectedPoint.latitude, selectedPoint.longitude],
        ]);

        map.fitBounds(bounds, {
          animate: true,
          duration: 0.7,
          maxZoom: 16,
          padding: [56, 56],
        });
        return;
      }

      map.flyTo([selectedPoint.latitude, selectedPoint.longitude], Math.max(map.getZoom(), 16), {
        duration: 0.7,
      });
      return;
    }

    map.setView([userLocation.latitude, userLocation.longitude], 15);
  }, [map, nearestPoint, selectedPoint, userLocation]);

  return null;
}

export default function CycleParkingMap({
  points,
  userLocation,
  selectedPoint,
  nearestPoint,
  onSelectPoint,
}: CycleParkingMapProps) {
  const icons = useMemo(
    () => ({
      default: createParkingIcon("default"),
      nearest: createParkingIcon("nearest"),
      selected: createParkingIcon("selected"),
    }),
    [],
  );

  return (
    <MapContainer
      attributionControl={false}
      center={defaultCenter}
      zoom={13}
      scrollWheelZoom
      className="bike-map"
    >
      <AttributionControl position="bottomright" prefix={false} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapFocus
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
        const icon =
          point.id === selectedPoint?.id
            ? icons.selected
            : point.id === nearestPoint?.id
              ? icons.nearest
              : icons.default;

        return (
          <Marker
            key={point.id}
            position={[point.latitude, point.longitude]}
            icon={icon}
            eventHandlers={{
              click: () => onSelectPoint(point.id),
            }}
          >
            <Popup>
              <div className="parking-popup">
                <strong>{point.name}</strong>
                {typeof point.distanceMeters === "number" ? (
                  <span>{formatDistance(point.distanceMeters)} away</span>
                ) : null}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
