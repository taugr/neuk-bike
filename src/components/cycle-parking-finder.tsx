"use client";

import dynamic from "next/dynamic";
import {
  Bike,
  Crosshair,
  LocateFixed,
  MapPin,
  Navigation,
  Search,
  ShieldAlert,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import cycleParkingDataset from "@/data/cycle-parking.json";
import type { ParkingPoint, UserLocation } from "@/lib/types";
import { EDINBURGH_FALLBACK_LOCATION, formatDistance, sortByDistance } from "@/lib/geo";

const CycleParkingMap = dynamic(() => import("@/components/cycle-parking-map"), {
  ssr: false,
  loading: () => <div className="map-loading">Loading map...</div>,
});

const parkingPoints = cycleParkingDataset.points as ParkingPoint[];

function describeParkingPoint(point: ParkingPoint) {
  const capacity =
    typeof point.properties.capacity === "number" && point.properties.capacity > 0
      ? `${point.properties.capacity} spaces`
      : null;
  const kind =
    typeof point.properties.bicycle_pa === "string" && point.properties.bicycle_pa.trim().length > 0
      ? point.properties.bicycle_pa.trim()
      : null;
  const covered =
    point.properties.covered === "yes"
      ? "covered"
      : point.properties.covered === "no"
        ? "not covered"
        : null;

  return [capacity, kind, covered].filter(Boolean).join(", ") || "Cycle parking";
}

type LocationState =
  | { status: "fallback"; location: UserLocation; message: string }
  | { status: "locating"; location: UserLocation; message: string }
  | { status: "located"; location: UserLocation; message: string }
  | { status: "denied"; location: UserLocation; message: string }
  | { status: "unavailable"; location: UserLocation; message: string };

function getUrlLocation() {
  const params = new URLSearchParams(window.location.search);
  const latitude = Number(params.get("lat"));
  const longitude = Number(params.get("lng"));

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null;
  }

  return { latitude, longitude };
}

export default function CycleParkingFinder() {
  const [locationState, setLocationState] = useState<LocationState>({
    status: "fallback",
    location: EDINBURGH_FALLBACK_LOCATION,
    message: "Using central Edinburgh until you share your location.",
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const urlLocation = getUrlLocation();
    if (urlLocation) {
      setLocationState({
        status: "located",
        location: urlLocation,
        message: "Sorted by the location in the URL.",
      });
      setSelectedId(null);
      return;
    }

    requestLocation();
  }, []);

  const nearbyPoints = useMemo(
    () => sortByDistance(parkingPoints, locationState.location),
    [locationState.location],
  );

  const filteredPoints = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const source =
      normalizedQuery.length === 0
        ? nearbyPoints
        : nearbyPoints.filter((point) => {
            const propertiesText = Object.entries(point.properties)
              .flatMap(([key, value]) => [key, value])
              .join(" ");
            const searchable =
              `${point.name} ${describeParkingPoint(point)} ${propertiesText}`.toLowerCase();
            return searchable.includes(normalizedQuery);
          });

    return source.slice(0, 24);
  }, [nearbyPoints, query]);

  const nearestPoint = nearbyPoints[0] ?? null;
  const explicitSelectedPoint =
    selectedId !== null ? (nearbyPoints.find((point) => point.id === selectedId) ?? null) : null;
  const selectedPoint = explicitSelectedPoint ?? nearestPoint;

  function requestLocation() {
    setSelectedId(null);

    if (!("geolocation" in navigator)) {
      setLocationState({
        status: "unavailable",
        location: EDINBURGH_FALLBACK_LOCATION,
        message: "Location is not available in this browser. Showing central Edinburgh.",
      });
      return;
    }

    setLocationState((current) => ({
      status: "locating",
      location: current.location,
      message: "Finding your current location...",
    }));

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocationState({
          status: "located",
          location: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          },
          message: "Sorted by your current location.",
        });
      },
      (error) => {
        setLocationState({
          status: error.code === error.PERMISSION_DENIED ? "denied" : "unavailable",
          location: EDINBURGH_FALLBACK_LOCATION,
          message:
            error.code === error.PERMISSION_DENIED
              ? "Location permission was denied. Showing central Edinburgh."
              : "Could not get your location. Showing central Edinburgh.",
        });
      },
      {
        enableHighAccuracy: true,
        maximumAge: 60_000,
        timeout: 10_000,
      },
    );
  }

  return (
    <main className="app-shell">
      <section className="map-pane" aria-label="Cycle parking map">
        <CycleParkingMap
          points={parkingPoints}
          userLocation={locationState.location}
          selectedPoint={explicitSelectedPoint}
          nearestPoint={nearestPoint}
          onSelectPoint={setSelectedId}
        />
      </section>

      <aside className="control-pane" aria-label="Nearest cycle parking">
        <header className="app-header">
          <div className="brand-mark" aria-hidden="true">
            <Bike size={24} strokeWidth={2.2} />
          </div>
          <div>
            <h1>Edinburgh Cycle Parking</h1>
            <p>{cycleParkingDataset.metadata.recordCount} cycle parking locations</p>
          </div>
        </header>

        <section className="nearest-panel" aria-live="polite">
          <div className="nearest-copy">
            <span className="section-label">
              <Navigation size={15} aria-hidden="true" />
              Nearest space
            </span>
            <h2>{nearestPoint?.name ?? "No parking found"}</h2>
            <p>
              {nearestPoint
                ? `${formatDistance(nearestPoint.distanceMeters)} from ${locationState.status === "located" ? "you" : "central Edinburgh"} - ${describeParkingPoint(nearestPoint)}`
                : "Refresh the dataset and try again."}
            </p>
          </div>
          <button
            className="location-button"
            type="button"
            onClick={requestLocation}
            disabled={locationState.status === "locating"}
          >
            {locationState.status === "locating" ? (
              <Crosshair size={18} aria-hidden="true" />
            ) : (
              <LocateFixed size={18} aria-hidden="true" />
            )}
            {locationState.status === "locating" ? "Locating" : "Use my location"}
          </button>
        </section>

        <div className={`status-message ${locationState.status}`}>
          {locationState.status === "denied" || locationState.status === "unavailable" ? (
            <ShieldAlert size={16} aria-hidden="true" />
          ) : (
            <MapPin size={16} aria-hidden="true" />
          )}
          <span>{locationState.message}</span>
        </div>

        <label className="search-box">
          <Search size={17} aria-hidden="true" />
          <span className="sr-only">Filter parking locations</span>
          <input
            type="search"
            value={query}
            placeholder="Filter nearby locations"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        <ol className="parking-list" aria-label="Nearby cycle parking locations">
          {filteredPoints.map((point, index) => (
            <li key={point.id}>
              <button
                className={point.id === selectedPoint?.id ? "parking-row selected" : "parking-row"}
                type="button"
                onClick={() => setSelectedId(point.id)}
              >
                <span className="rank">{index + 1}</span>
                <span className="parking-row-copy">
                  <strong>{point.name}</strong>
                  <span>
                    {formatDistance(point.distanceMeters)} away - {describeParkingPoint(point)}
                  </span>
                </span>
                <MapPin size={18} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ol>

        {filteredPoints.length === 0 ? (
          <div className="empty-state" role="status">
            No cycle parking locations match that filter.
          </div>
        ) : null}

        <footer className="attribution">
          <span>{cycleParkingDataset.metadata.attribution}</span>
          <a href={cycleParkingDataset.metadata.licenceUrl}>Open Government Licence v3.0</a>
        </footer>
      </aside>
    </main>
  );
}
